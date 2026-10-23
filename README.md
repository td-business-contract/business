# Toscana Diagnostica · Business

Webapp per la contrattualistica B2B di Toscana Diagnostica: Punti Prelievo (contratto di appalto con la struttura ospitante e fascicolo di autorizzazione sanitaria), Service di Laboratorio (lettera di offerta TD-SGI-MOD230) e Medicina del Lavoro (lettera di offerta TD-SGI-MOD231). Destinata a business.toscanadiagnostica.it. Stesso stack e stessa interfaccia di Finance, Cash, Shipments, Orders e SGI.

## Cosa fa

1. Anagrafica partner e clienti B2B sul tracciato TD-SGI-MOD173 (identificazione, riferimenti per il servizio e l'approvvigionamento, condizioni di pagamento e classificazione fiscale, banca). Un partner può avere più contratti.
2. Per ogni sezione, una proposta con i dati specifici:
   - Punti Prelievo: sede del Poliambulatorio ospitante (premesse del contratto), corrispettivo a percentuale e/o fisso con IVA (oltre IVA, inclusa, esente), durata, decorrenza, costi della sicurezza (Allegato 2).
   - Service: sede operativa, Direttore Sanitario della struttura cliente, condizioni di vendita (PEC, SDI, esenzione IVA, pagamento, banca dall'anagrafica), logistica dei ritiri (Allegato 3, giorno per giorno), interfacciamento (Allegato 6), ruolo privacy e DPO (Allegato 8), sconto sul listino (Allegato 2).
   - Medicina del Lavoro: e-mail e contatto per gli appuntamenti, e-mail fatture, Medico del Lavoro ed e-mail per l'anticipo dei referti, condizioni di vendita, ruolo privacy (Allegato 3), sconto sul listino (Allegato 1).
3. Generazione del documento in DOCX e PDF dal format aziendale, con protocollo progressivo per sezione e anno (PP-2026-0001, SRV-2026-0001, MDL-2026-0001) e numero di versione. Il documento si firma con il partner fuori dall'app; la copia sottoscritta (PDF) si carica e porta il contratto in stato Firmato. Nessun invio automatico di email.
4. Service e Medicina del Lavoro: caricamento del listino dell'offerta in XLSX e PDF; credenziali di accesso al portale del cliente, password cifrata AES-256-GCM, visualizzabile solo dai manager della sezione e con registrazione di ogni visualizzazione.
5. Punti Prelievo: fascicolo di autorizzazione sanitaria (L.R. Toscana 51/2009) con 22 documenti in catalogo. L'app genera dai format aziendali Modello 5 (con autocertificazione ex A23), Modello 6, Relazione operativa (orari, note alle liste, elenco personale e strumentazione), Relazione attività non insudicianti, Collegamento funzionale, Dichiarazione sporco/pulito, Atto di condivisione procedure con la struttura ospitante, DUVRI e DVR (bozze da validare con il RSPP), Elenco del personale, Inventario della strumentazione. Le liste di autovalutazione A, B e B1.1 sono precaricate con le risposte e i riferimenti SGI del punto prelievi di Calenzano, si modificano requisito per requisito e si esportano in XLSX nel tracciato regionale. Si caricano planimetrie, relazione tecnica, disponibilità dei locali, gestione dei farmaci, dichiarazioni di conformità degli impianti, documenti ulteriori e, a chiusura, l'autorizzazione del Comune (che porta contratto e fascicolo in stato Autorizzato). Ogni documento generato può ricevere la versione firmata; il cruscotto mostra il completamento.
6. Cruscotto, registro attività, profili e permessi, accesso Microsoft 365.

## Profili

Superamministratore (tutto, più Utenti, Impostazioni e Registro), Service Manager (sezione Service), Retail Manager (sezione Punti Prelievo e fascicolo), MDL Manager (sezione Medicina del Lavoro), HQS Manager (fascicolo di autorizzazione dei punti prelievo), Consultazione (sola lettura). Tutti leggono tutte le sezioni e l'anagrafica; i manager creano e modificano le anagrafiche partner. Il contratto firmato lo rimuove solo il Superamministratore.

## Stati del contratto

Bozza → Proposta inviata (documento generato e protocollato) → Firmato (copia sottoscritta caricata) → Autorizzato (solo Punti Prelievo, al caricamento dell'autorizzazione o dalla scheda del fascicolo) → Attivo. In ogni momento: Annullato (con motivazione); da Firmato in poi: Cessato (con motivazione e data). I dati di una proposta si modificano fino alla firma; dopo, si fa una nuova proposta.

## Architettura

- server/: Node.js 22, Express, PostgreSQL 16. API REST, sessioni su database, CSRF, rate limit sul login, audit log. Documenti con docxtemplater sui template in server/src/templates, PDF con LibreOffice headless, XLSX con ExcelJS. File (documenti generati, firmati, listini, fascicolo) nel database (bytea). Credenziali dei portali cifrate con CREDENTIALS_KEY.
- web/: React 18, Vite. Interfaccia in italiano, palette aziendale, responsive.
- tools/: build_templates.py (python-docx, openpyxl, Pillow) costruisce i template dai format in tools/assets e il JSON delle liste di autovalutazione.
- Dockerfile unico (frontend buildato e servito dal server, LibreOffice incluso). render.yaml per il deploy Blueprint.

## Deploy su Render (GitHub + Render)

1. Crea il repository GitHub "business" e carica il contenuto di questa cartella.
2. render.com, New > Blueprint, collega il repository: render.yaml crea il database (basic-1gb) e il servizio web Docker. Primo build 5-8 minuti (LibreOffice).
3. Nel pannello del servizio inserisci SEED_ADMIN_PASSWORD (min 12 caratteri) e le variabili ENTRA_* (sotto). Al primo accesso con password l'app chiede di cambiarla e di attivare la verifica in due passaggi.
4. Dominio: Settings > Custom Domains > business.toscanadiagnostica.it, poi record CNAME `business` verso td-business.onrender.com. BASE_URL è già sul dominio ufficiale, senza barra finale (con la barra il redirect Microsoft fallisce con AADSTS50011): l'host tecnico resta raggiungibile e viene reindirizzato.
5. Impostazioni: completa i dati anagrafici del legale rappresentante e del Direttore Sanitario (compaiono su Modello 5, Modello 6 e dichiarazioni), le figure della sicurezza, i prefissi di protocollo.
6. Utenti: censisci i manager di sezione e HQS con l'email del tenant Microsoft 365.

Costo indicativo: 7 $/mese web + 19 $/mese database basic-1gb (verificare i listini). Il piano free non va bene (il servizio dorme e il database viene cancellato).

## Microsoft 365 (Entra ID)

Serve un Global Administrator del tenant. Registrazione dedicata "TD Business" (come fatto per Orders) oppure riuso di un'app esistente aggiungendo il redirect URI.

1. Entra ID > App registrations > New registration: nome "TD Business", account solo di questa organizzazione, piattaforma Web, redirect URI `https://business.toscanadiagnostica.it/api/auth/entra/callback` (aggiungere anche `https://td-business.onrender.com/api/auth/entra/callback` finché il dominio non è attivo).
2. Certificates & secrets > New client secret (24 mesi): copiare subito il valore e annotare la scadenza.
3. Token configuration > Add optional claim > ID token > `email`.
4. Overview: Directory (tenant) ID e Application (client) ID. Render > Environment: ENTRA_TENANT_ID, ENTRA_CLIENT_ID, ENTRA_CLIENT_SECRET. Riavviare.
5. Ogni utente va censito in Utenti con la stessa email dell'account Microsoft 365. Nessun permesso Graph: l'app non invia email.

## Sviluppo locale e collaudo

```bash
cd server && npm install
DATABASE_URL=postgres://postgres:dev@localhost:5432/business SEED_ADMIN_EMAIL=tu@esempio.it SEED_ADMIN_PASSWORD=Password-Temporanea-1 REQUIRE_TOTP_FOR_ADMINS=false npm start
cd web && npm install && npm run dev   # proxy delle API su :3000
```

Collaudo end-to-end su database pulito (42 passi: tre flussi completi, fascicolo con generazione di tutti i documenti, permessi dei sei profili): `bash server/test/run-local.sh` con PostgreSQL locale e LibreOffice.

## Template dei documenti

I format aziendali sono in tools/assets (DOCX e XLSX). `python3 tools/build_templates.py` produce i template docxtemplater in server/src/templates e il JSON delle liste in server/src/data. Per aggiornare un testo contrattuale si sostituisce il DOCX in tools/assets e si rilancia lo script. Correzioni applicate ai format in fase di templatizzazione: nel contratto Punti Prelievo il riferimento ai locali "di cui all'Allegato 2" (art. 4.4) rimanda all'Allegato 1, che li identifica; nella dichiarazione di collegamento funzionale sottotitolo e premessa riportavano per errore il testo della dichiarazione sporco/pulito; dal Modello 6 è stata tolta la firma autografa scansionata. Le dichiarazioni di esenzione IVA, i ritiri, le soluzioni di interfacciamento e il ruolo privacy sono compilati con caselle ☒/☐.

## API

Tutte sotto /api, sessione via cookie, header `X-Requested-With: td-business` sulle richieste che modificano dati.

- auth: config, login, totp, logout, me, change-password, totp/setup, totp/enable, entra/login, entra/callback
- users, settings, partners, audit
- contracts (GET lista con filtri kind/status/year/partner_id/q, POST, GET/PUT/DELETE :id, :id/generate, :id/files, :id/status, :id/credentials)
- dossiers/:contractId (GET, PUT; docs/:key; checklists/:list e reset; generate/:key; generate-all; upload/:key; files/:fid)
- contract-files/:id, dossier-files/:id (download)
- stats/summary

## Prossime funzionalità (predisposte)

Export XLSX dell'anagrafica B2B (MOD173) e del registro contratti; scadenzario (rinnovi taciti, disdette, scadenza del secret Entra); invio della proposta al partner via email da una casella business@ (il modulo mail di Finance è riusabile); importazione dei clienti Service da StudioLab (già censiti in Orders).
