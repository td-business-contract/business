#!/usr/bin/env python3
"""Costruisce i pacchetti ZIP di importazione dello status quo per Toscana Diagnostica Business.

Input: un dataset JSON (partner, contratti, file con percorso di origine) e la mappa dei percorsi di origine
verso le cartelle locali che contengono i documenti. Output: uno o più ZIP con manifest.json e la cartella files/.

Uso:
  python3 build_package.py --dataset dataset.json --out ./pacchetti \
     --map "C:\\...\\Business=/percorso/locale/Business" --map "C:\\...\\Autorizzazioni Sanitarie=/percorso/locale/Autorizzazioni Sanitarie" \
     --group SRV-A:SRV:a-l --group SRV-B:SRV:m-z --group PP:PP --group SEDE-MDL:SEDE,MDL

Ogni gruppo produce un pacchetto con il manifest completo dei partner e i soli contratti del gruppo, ordinati per tipo
e data di proposta (è l'ordine dei protocolli). Con --chunk-mb N il gruppo viene spezzato in pacchetti numerati sotto N MB:
un contratto può proseguire nel pacchetto successivo (voce con "append": true, l'app aggiunge solo i file mancanti).
Con --skip-over-mb N i singoli file più grandi di N MB vengono esclusi ed elencati a fine esecuzione.
I file sono rinominati files/<chiave contratto>/<nnn>_<nome originale>.
"""
import argparse, json, os, re, sys, zipfile, datetime

KORD = {'SRV': 0, 'PP': 1, 'SEDE': 2, 'MDL': 3}


def norm(p):
    return p.replace('\\', '/')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dataset', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--map', action='append', default=[], help='prefisso_origine=cartella_locale')
    ap.add_argument('--group', action='append', default=[], help='nome:KIND[,KIND]:[iniziale-iniziale]')
    ap.add_argument('--missing', choices=['fail', 'skip'], default='fail')
    ap.add_argument('--chunk-mb', type=float, default=0, help='spezza ogni gruppo in pacchetti numerati sotto questa dimensione')
    ap.add_argument('--skip-over-mb', type=float, default=0, help='esclude i singoli file sopra questa dimensione')
    a = ap.parse_args()
    ds = json.load(open(a.dataset, encoding='utf-8'))
    maps = []
    for m in a.map:
        src, dst = m.split('=', 1)
        maps.append((norm(src).rstrip('/'), dst.rstrip('/')))

    def local(src):
        s = norm(src)
        for pre, dst in maps:
            if s.startswith(pre + '/'):
                return os.path.join(dst, s[len(pre) + 1:])
        return None

    groups = []
    for g in a.group or ['TUTTO:PP,SRV,MDL,SEDE']:
        parts = g.split(':')
        name, kinds = parts[0], parts[1].split(',')
        rng = parts[2] if len(parts) > 2 and parts[2] else None
        groups.append((name, kinds, rng))
    os.makedirs(a.out, exist_ok=True)
    missing, skipped = [], []
    stamp = datetime.date.today().isoformat()

    def entries(c):
        """Elenco (tipo, meta, percorso locale, nome in archivio, dimensione) dei file di un contratto."""
        out, n = [], 0
        for kind, lst in (('file', c.get('files', [])), ('doss', (c.get('dossier') or {}).get('files', []))):
            for f in lst:
                lp = local(f['src'])
                if not lp or not os.path.isfile(lp):
                    missing.append((c['key'], f['src'])); continue
                sz = os.path.getsize(lp)
                if a.skip_over_mb and sz > a.skip_over_mb * 1e6:
                    skipped.append((c['key'], f['src'], sz)); continue
                n += 1
                arc = f"files/{c['key']}/{n:03d}_{os.path.basename(norm(f['src']))}"
                out.append((kind, f, lp, arc, sz))
        return out

    def manifest_contract(c, ents, append):
        mc = {k: v for k, v in c.items() if k not in ('files', 'dossier', 'source_folder')}
        if append: mc['append'] = True
        mc['files'] = [{'path': arc, 'category': f['category'], 'label': f.get('label')} for kind, f, lp, arc, sz in ents if kind == 'file']
        if c.get('dossier') is not None:
            d = {k: v for k, v in c['dossier'].items() if k != 'files'}
            d['files'] = [{'path': arc, 'doc_key': f['doc_key'], 'label': f.get('label')} for kind, f, lp, arc, sz in ents if kind == 'doss']
            mc['dossier'] = d
        return mc

    for name, kinds, rng in groups:
        contracts = []
        for c in ds['contracts']:
            if c['kind'] not in kinds: continue
            if rng:
                lo, hi = rng.split('-')
                initial = re.sub(r'^[A-Z]+-', '', c['key'])[:1].lower()
                if not (lo <= initial <= hi): continue
            contracts.append(c)
        if not contracts: continue
        contracts.sort(key=lambda c: (KORD.get(c['kind'], 9), c.get('proposal_date') or '', c['key']))
        packs = []  # lista di (nome, [(contratto, voci, append)])
        if not a.chunk_mb:
            packs.append((name, [(c, entries(c), False) for c in contracts]))
        else:
            limit = a.chunk_mb * 1e6
            cur, tot, i = [], 0, 0
            for c in contracts:
                ents = entries(c)
                seen, part = False, []
                for e in ents:
                    if tot + e[4] > limit and (cur or part):
                        if part: cur.append((c, part, seen)); seen = True; part = []
                        i += 1; packs.append((f'{name}-{i:02d}', cur)); cur, tot = [], 0
                    part.append(e); tot += e[4]
                if part or not seen:
                    cur.append((c, part, seen))
            if cur: i += 1; packs.append((f'{name}-{i:02d}', cur))
        for pname, plist in packs:
            outp = os.path.join(a.out, f'{stamp}_TD_Business_import_{pname}.zip')
            manifest = {'version': 1, 'generated': stamp, 'partners': ds['partners'], 'contracts': []}
            with zipfile.ZipFile(outp, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
                for c, ents, append in plist:
                    for kind, f, lp, arc, sz in ents: z.write(lp, arc)
                    manifest['contracts'].append(manifest_contract(c, ents, append))
                z.writestr('manifest.json', json.dumps(manifest, ensure_ascii=False, indent=1))
            nfiles = sum(len(e) for _, e, _ in plist)
            print(f'{outp}: {len(plist)} voci, {nfiles} file, {os.path.getsize(outp) / 1e6:.1f} MB')
    if skipped:
        print(f'{len(skipped)} file esclusi perché sopra {a.skip_over_mb} MB (da caricare a mano):', file=sys.stderr)
        for k, s, sz in skipped: print(f'  {k}: {s} ({sz / 1e6:.1f} MB)', file=sys.stderr)
    if missing:
        print(f'{len(missing)} file non trovati:', file=sys.stderr)
        for k, s in missing: print(f'  {k}: {s}', file=sys.stderr)
        if a.missing == 'fail': sys.exit(1)


if __name__ == '__main__':
    main()
