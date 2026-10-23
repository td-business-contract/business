// Collaudo end-to-end delle API su database locale: tre flussi (Punto Prelievi con fascicolo, Service, Medicina del Lavoro)
// Uso: node test/api-test.mjs [baseUrl]   (richiede il server avviato con SEED_ADMIN_* e REQUIRE_TOTP_FOR_ADMINS=false)
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.argv[2] || 'http://localhost:3000';
const EMAIL = process.env.SEED_ADMIN_EMAIL || 'francesco.epifani@toscanadiagnostica.it';
const PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'Password-Temporanea-1';
const OUT = process.env.TEST_OUT || '/tmp/tdb-test-out';
fs.mkdirSync(OUT, { recursive: true });

let cookie = '';
let step = 0;
const ok = (msg) => console.log(`  ${String(++step).padStart(2, '0')}. ${msg}`);
const fail = (msg) => { console.error(`FALLITO: ${msg}`); process.exit(1); };
const assert = (c, msg) => { if (!c) fail(msg); };

async function api(method, url, body, form) {
  const headers = { 'X-Requested-With': 'td-business', Cookie: cookie };
  if (body && !form) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}/api${url}`, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${data?.error || ''} ${data?.details ? JSON.stringify(data.details) : ''}`);
  return data;
}
const expectFail = async (p, msg) => { try { await p; fail(`atteso errore: ${msg}`); } catch (e) { if (e.message.startsWith('atteso errore')) throw e; ok(`${msg} (rifiutato: ${e.message.split('->')[1].trim().slice(0, 80)})`); } };
const formOf = (files, fields = {}) => { const fd = new FormData(); for (const [k, v] of Object.entries(fields)) fd.append(k, v); for (const f of files) fd.append('files', new Blob([f.data], { type: f.mime }), f.name); return fd; };
const save = async (fileId, route, name) => { const buf = await api('GET', `/${route}/${fileId}`); fs.writeFileSync(path.join(OUT, name), buf); return buf.length; };

console.log(`Collaudo TD Business su ${BASE}`);
// ---------- accesso ----------
let r = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
if (r.onboarding === 'PASSWORD_CHANGE_REQUIRED') { await api('POST', '/auth/change-password', { currentPassword: PASSWORD, newPassword: 'Password-Definitiva-2026' }); ok('cambio password al primo accesso'); }
const me = await api('GET', '/auth/me'); assert(me.user.role === 'ADMIN', 'profilo ADMIN'); ok(`accesso come ${me.user.full_name} (${me.user.role})`);

// ---------- impostazioni e utenti ----------
await api('PUT', '/settings', { lr_birth_place: 'Poggiardo (LE)', lr_birth_date: '03/08/1984', lr_residence: 'Sesto Fiorentino (FI), Via Antonio Gramsci, 128', lr_tax_code: 'XXXXXX00X00X000X', lr_phone: '+39 347 0000000', ds_birth_place: 'Firenze (FI)', ds_birth_date: '02/03/1946', ds_residence: 'Firenze, viale Giuseppe Mazzini 31', ds_tax_code: 'YYYYYY00Y00Y000Y' });
ok('impostazioni: dati del legale rappresentante e del direttore sanitario');
const users = {};
for (const [role, name] of [['SERVICE', 'Service Manager'], ['RETAIL', 'Retail Manager'], ['MDL', 'MDL Manager'], ['HQS', 'HQS Manager'], ['VIEWER', 'Consultazione']]) {
  users[role] = await api('POST', '/users', { email: `${role.toLowerCase()}@toscanadiagnostica.it`, full_name: name, role, auth_provider: 'LOCAL' });
}
ok('creati i cinque profili (password temporanee restituite)');
const adminCookie = cookie;
async function loginAs(role) { cookie = ''; const u = users[role]; const res = await api('POST', '/auth/login', { email: u.email, password: u.temp_password }); if (res.onboarding) await api('POST', '/auth/change-password', { currentPassword: u.temp_password, newPassword: `Nuova-${role}-Password-1` }); u.pwd = `Nuova-${role}-Password-1`; }

// ---------- anagrafica partner ----------
const host = await api('POST', '/partners', { name: 'Poliambulatorio Esempio S.r.l.', vat: '01234567890', tax_code: '01234567890', street: 'Via di Prato, 26', zip: '50041', city: 'Calenzano', prov: 'FI', pec: 'esempio@pec.it', legal_rep: 'Mario Rossi', signer: 'Mario Rossi', signer_role: 'Amministratore Unico', email: 'info@esempio.it', phone: '055 000000', sdi: 'ABCDEFG', pay_terms: '30 gg fm', bank_name: 'Banca Esempio', iban: 'IT60X0542811101000000123456' });
const clientSrv = await api('POST', '/partners', { name: 'Laboratorio Cliente S.r.l.', vat: '09876543210', street: 'Via Roma, 1', zip: '57100', city: 'Livorno', prov: 'LI', pec: 'lab@pec.it', sdi: 'XYZ1234', legal_rep: 'Anna Bianchi', svc_contact: 'Luca Verdi', svc_email: 'luca@cliente.it', svc_mobile: '333 1111111' });
const clientMdl = await api('POST', '/partners', { name: 'Impresa Cliente S.p.A.', vat: '11223344556', street: 'Via Milano, 10', zip: '50100', city: 'Firenze', prov: 'FI', pec: 'impresa@pec.it', legal_rep: 'Paolo Neri' });
ok(`anagrafica: 3 partner creati (${host.id}, ${clientSrv.id}, ${clientMdl.id})`);
const list = await api('GET', '/partners?q=cliente'); assert(list.length === 2, 'ricerca partner'); ok('ricerca anagrafica per nome');

// ================= 1. PUNTO PRELIEVI =================
console.log('Punto Prelievi');
let pp = await api('POST', '/contracts', { kind: 'PP', partner_id: host.id, proposal_date: '2026-10-23', start_date: '2026-12-01', data: { site: { street: 'Via di Prato, 26', zip: '50041', city: 'Calenzano', prov: 'FI' }, fee: { type: 'BOTH', percent: 20, fixed_amount: 300, fixed_period: 'MESE', vat: 'PIU_IVA' }, duration_years: 3 } });
assert(pp.status === 'BOZZA' && pp.dossier, 'contratto PP con fascicolo'); ok(`contratto PP #${pp.id} in bozza con fascicolo #${pp.dossier.id}`);
await expectFail(api('POST', `/contracts/${pp.id}/files`, null, formOf([{ name: 'firmato.pdf', mime: 'application/pdf', data: Buffer.from('%PDF-1.4 test') }], { category: 'FIRMATO' })), 'upload firmato prima della generazione');
pp = await api('POST', `/contracts/${pp.id}/generate`);
assert(pp.protocol?.startsWith('PP-2026-') && pp.status === 'PROPOSTA', 'protocollo PP'); ok(`proposta generata ${pp.protocol} v${pp.version}${pp.pdfError ? ` (PDF: ${pp.pdfError})` : ''}`);
const ppDocx = pp.files.find((f) => f.category === 'GENERATO_DOCX'); const ppPdf = pp.files.find((f) => f.category === 'GENERATO_PDF');
assert(ppDocx && ppPdf, 'DOCX e PDF del contratto PP');
ok(`scaricati ${await save(ppDocx.id, 'contract-files', 'PP_contratto.docx')} byte DOCX e ${await save(ppPdf.id, 'contract-files', 'PP_contratto.pdf')} byte PDF`);
pp = await api('PUT', `/contracts/${pp.id}`, { data: { ...pp.data, fee: { type: 'PERCENT', percent: 22.5, vat: 'IVA_INCLUSA' } } });
pp = await api('POST', `/contracts/${pp.id}/generate`); assert(pp.version === 2, 'versione 2'); ok(`modifica del corrispettivo e rigenerazione: v${pp.version}, un solo DOCX generato conservato (${pp.files.filter((f) => f.category === 'GENERATO_DOCX').length})`);
pp = await api('POST', `/contracts/${pp.id}/files`, null, formOf([{ name: 'Contratto_firmato.pdf', mime: 'application/pdf', data: fs.readFileSync(path.join(OUT, 'PP_contratto.pdf')) }], { category: 'FIRMATO', signed_at: '2026-10-24' }));
assert(pp.status === 'FIRMATO' && pp.signed_at === '2026-10-24', 'stato FIRMATO'); ok('contratto firmato caricato: stato Firmato');
await expectFail(api('PUT', `/contracts/${pp.id}`, { notes: 'x' }), 'modifica dopo la firma');

// fascicolo
let fx = await api('GET', `/dossiers/${pp.id}`);
assert(fx.dossier.rows.length === 22 && fx.dossier.checklists.length === 3, 'catalogo e liste precaricate'); ok(`fascicolo: ${fx.dossier.rows.length} documenti in catalogo, ${fx.dossier.pct}% completo, liste A/B/B1.1 precaricate (${fx.dossier.checklists.map((L) => L.items.length).join('/')} requisiti)`);
fx = await api('PUT', `/dossiers/${pp.id}`, {
  doc_date: '2026-10-23',
  staff: [{ surname: 'Taddei', name: 'Gian Luigi', affiliation: 'Libero Professionista', contract: 'LP', hours: '2,00', role: 'Direttore Sanitario', degree: 'Laurea Magistrale in Medicina e Chirurgia' }, { surname: 'Rossi', name: 'Maria', affiliation: 'Libero Professionista', contract: 'LP', hours: '5,00', role: 'Personale Sanitario', degree: 'Laurea in Infermieristica' }],
  equipment: [{ type: 'Defibrillatore', maker: 'CU Medical', model: 'I-PAD CU-SP1', serial: 'SN123', power: 'Batteria', ownership: 'Acquisto', condition: 'Nuovo', tested_at: '2026-11-20' }, { type: 'Centrifuga', maker: 'Benchmark', model: 'LC8 Plus', power: 'Corrente di rete', ownership: 'Acquisto', condition: 'Nuovo', tested_at: '2026-11-20' }],
  extra: { floor: 'Piano Terra', building_type: 'Studi Medici', workers: '1', prov_name: 'Firenze', dvr_code: 'TD-SGI-REG030_00', duvri_code: 'TD-SGI-REG031_00' },
});
ok('fascicolo: personale (2), strumentazione (2), orari predefiniti, codici DVR/DUVRI');
const A = fx.checklists.find((L) => L.code === 'A');
A.items[3].answer = 'Sì'; A.items[3].document = 'Personale indicato nell’elenco allegato';
fx = await api('PUT', `/dossiers/${pp.id}/checklists/A`, { items: A.items }); ok('lista A: risposta modificata e salvata');
fx = await api('POST', `/dossiers/${pp.id}/generate-all`);
assert(!fx.errors?.length, `generazione completa senza errori: ${JSON.stringify(fx.errors)}`);
const gen = fx.rows.filter((x) => x.status === 'GENERATO' || x.status === 'COMPILATO');
ok(`generazione completa del fascicolo: ${gen.length} documenti generati (${fx.pct}% completo)`);
for (const row of fx.rows) for (const f of row.files) await save(f.id, 'dossier-files', f.filename);
ok(`scaricati ${fx.rows.reduce((a, x) => a + x.files.length, 0)} file del fascicolo in ${OUT}`);
fx = await api('POST', `/dossiers/${pp.id}/upload/PLANIMETRIA_GENERALE`, null, formOf([{ name: 'planimetria.pdf', mime: 'application/pdf', data: Buffer.from('%PDF-1.4 plan') }]));
fx = await api('POST', `/dossiers/${pp.id}/upload/CONFORMITA_IMPIANTI`, null, formOf([{ name: 'DiCo_elettrico.pdf', mime: 'application/pdf', data: Buffer.from('%PDF') }, { name: 'DiCo_idrico.pdf', mime: 'application/pdf', data: Buffer.from('%PDF') }]));
fx = await api('POST', `/dossiers/${pp.id}/upload/MODELLO_5`, null, formOf([{ name: 'Modello5_firmato.pdf', mime: 'application/pdf', data: Buffer.from('%PDF') }]));
assert(fx.rows.find((x) => x.key === 'CONFORMITA_IMPIANTI').files.length === 2 && fx.rows.find((x) => x.key === 'MODELLO_5').status === 'CARICATO', 'upload fascicolo');
ok(`upload: planimetria, 2 dichiarazioni di conformità, Modello 5 firmato (${fx.pct}% completo, ${fx.signed}/${fx.required} con versione firmata o caricata)`);
fx = await api('PUT', `/dossiers/${pp.id}/docs/GESTIONE_FARMACI`, { not_applicable: true, note: 'Nessun farmaco in sede: solo zaino emergenza' }); ok('documento marcato non applicabile con nota');
fx = await api('POST', `/dossiers/${pp.id}/upload/AUTORIZZAZIONE`, null, formOf([{ name: 'Autorizzazione_Comune.pdf', mime: 'application/pdf', data: Buffer.from('%PDF') }]));
pp = await api('GET', `/contracts/${pp.id}`); assert(pp.status === 'AUTORIZZATO' && fx.status === 'AUTORIZZATO', 'stato AUTORIZZATO'); ok('autorizzazione caricata: fascicolo e contratto in stato Autorizzato');
pp = await api('POST', `/contracts/${pp.id}/status`, { status: 'ATTIVO' }); ok('contratto PP attivo');

// ================= 2. SERVICE =================
console.log('Service di Laboratorio');
let sv = await api('POST', '/contracts', { kind: 'SRV', partner_id: clientSrv.id, proposal_date: '2026-10-23', data: { site_name: 'Laboratorio Cliente, sede di Livorno', site_address: 'Via Roma 1, Livorno', client_ds: 'dott. Carlo Bruni', vat_exemption: true, discount_percent: 35, pickup: { site: 'Sede di Livorno', street: 'Via Roma 1', city: 'Livorno', contact: 'Luca Verdi', phone: '333 1111111', email: 'luca@cliente.it', days: [{ mode: 'FISSO', time: '12:00' }, { mode: 'FISSO', time: '12:00' }, { mode: 'CHIAMATA', time: '' }, { mode: 'FISSO', time: '12:00' }, { mode: 'FISSO', time: '12:00' }, { mode: 'NO' }] }, interface_solution: 2, privacy: { role: 'TITOLARE', dpo_name: 'Avv. Dpo Cliente', dpo_contact: 'dpo@cliente.it' } } });
sv = await api('POST', `/contracts/${sv.id}/generate`); assert(sv.protocol.startsWith('SRV-2026-'), 'protocollo SRV'); ok(`offerta Service generata ${sv.protocol}`);
await save(sv.files.find((f) => f.category === 'GENERATO_PDF').id, 'contract-files', 'SRV_offerta.pdf'); await save(sv.files.find((f) => f.category === 'GENERATO_DOCX').id, 'contract-files', 'SRV_offerta.docx');
await expectFail(api('POST', `/contracts/${sv.id}/files`, null, formOf([{ name: 'listino.csv', mime: 'text/csv', data: Buffer.from('a;b') }], { category: 'LISTINO_XLSX' })), 'listino in formato non XLSX');
sv = await api('POST', `/contracts/${sv.id}/files`, null, formOf([{ name: 'Listino_Service_2026.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', data: Buffer.from('PK\x03\x04 fake') }], { category: 'LISTINO_XLSX' }));
sv = await api('POST', `/contracts/${sv.id}/files`, null, formOf([{ name: 'Listino_Service_2026.pdf', mime: 'application/pdf', data: Buffer.from('%PDF') }], { category: 'LISTINO_PDF' }));
assert(sv.data.price_list_file === 'Listino_Service_2026.pdf', 'listino registrato'); ok('listino caricato in XLSX e PDF');
sv = await api('POST', `/contracts/${sv.id}/files`, null, formOf([{ name: 'Offerta_firmata.pdf', mime: 'application/pdf', data: Buffer.from('%PDF') }], { category: 'FIRMATO' })); assert(sv.status === 'FIRMATO', 'SRV firmato'); ok('offerta Service firmata');
await api('PUT', `/contracts/${sv.id}/credentials`, { portal_url: 'https://portale.toscanadiagnostica.it', username: 'labcliente', password: 'S3greta!2026', notes: 'Consegnate al referente' });
let cred = await api('GET', `/contracts/${sv.id}/credentials`); assert(cred.has_password && cred.password === undefined, 'password non in chiaro di default');
cred = await api('GET', `/contracts/${sv.id}/credentials?reveal=1`); assert(cred.password === 'S3greta!2026', 'decifratura'); ok('credenziali portale: salvate cifrate, rivelate solo su richiesta (evento registrato)');
sv = await api('POST', `/contracts/${sv.id}/status`, { status: 'ATTIVO' }); ok('contratto Service attivo');

// ================= 3. MEDICINA DEL LAVORO =================
console.log('Medicina del Lavoro');
let md = await api('POST', '/contracts', { kind: 'MDL', partner_id: clientMdl.id, proposal_date: '2026-10-23', data: { service_email: 'hr@impresa.it', service_contact: 'Giulia Gialli', service_phone: '055 123456', invoice_email: 'fatture@impresa.it', doctor_name: 'dott. Medico Competente', doctor_email: 'mc@impresa.it', vat_exemption: false, discount_percent: 10, privacy: { role: 'TITOLARE' } } });
md = await api('POST', `/contracts/${md.id}/generate`); assert(md.protocol.startsWith('MDL-2026-'), 'protocollo MDL'); ok(`offerta MdL generata ${md.protocol}`);
await save(md.files.find((f) => f.category === 'GENERATO_PDF').id, 'contract-files', 'MDL_offerta.pdf');
md = await api('POST', `/contracts/${md.id}/files`, null, formOf([{ name: 'Listino_MdL.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', data: Buffer.from('PK fake') }], { category: 'LISTINO_XLSX' }));
await api('PUT', `/contracts/${md.id}/credentials`, { username: 'impresa', password: 'Pwd-Impresa-1' }); ok('listino e credenziali MdL');

// ================= permessi =================
console.log('Permessi');
await loginAs('SERVICE');
await expectFail(api('POST', '/contracts', { kind: 'MDL', partner_id: clientMdl.id, proposal_date: '2026-10-23', data: {} }), 'Service Manager su contratto MdL');
const own = await api('POST', '/contracts', { kind: 'SRV', partner_id: clientSrv.id, proposal_date: '2026-10-23', data: {} }); ok('Service Manager crea una proposta Service');
await expectFail(api('PUT', `/dossiers/${pp.id}`, { extra: { notes: 'x' } }), 'Service Manager sul fascicolo');
await expectFail(api('GET', '/users'), 'Service Manager su Utenti');
await loginAs('HQS');
await api('PUT', `/dossiers/${pp.id}`, { extra: { notes: 'Nota HQS' } }); ok('HQS Manager aggiorna il fascicolo');
await expectFail(api('POST', `/contracts/${own.id}/generate`), 'HQS Manager genera una proposta Service');
await loginAs('VIEWER');
const all = await api('GET', '/contracts'); assert(all.length === 4, 'consultazione vede tutto'); ok(`Consultazione legge ${all.length} contratti`);
await expectFail(api('PUT', `/contracts/${own.id}`, { notes: 'x' }), 'Consultazione modifica');
cred = await api('GET', `/contracts/${sv.id}/credentials?reveal=1`); assert(cred.password === undefined, 'viewer non rivela'); ok('Consultazione non può rivelare le password');
cookie = adminCookie;
await api('DELETE', `/contracts/${own.id}`); ok('bozza eliminata dal Superamministratore');

// ================= cruscotto e registro =================
const st = await api('GET', '/stats/summary'); assert(st.dossiers.length === 1 && st.byKind.length >= 3, 'statistiche'); ok(`cruscotto: ${st.byKind.length} combinazioni tipo/stato, ${st.dossiers.length} fascicolo (${st.dossiers[0].pct}%)`);
const au = await api('GET', '/audit?limit=50'); assert(au.length >= 20, 'registro'); ok(`registro attività: ${au.length} voci`);
console.log(`\nCollaudo completato: ${step} passi superati. File generati in ${OUT}`);
