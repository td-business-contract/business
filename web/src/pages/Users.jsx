import React, { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi, Card, Field, ErrorBox, Loading, Badge, Modal, ConfirmModal, useToast } from '../components/ui.jsx';
import { ROLE, ROLE_HELP, itDateTime } from '../format.js';

const PROVIDER = { ENTRA: 'Microsoft 365', BOTH: 'Microsoft 365 o password', LOCAL: 'Email e password' };
const TONE = { ADMIN: 'mauve', SERVICE: 'blue', RETAIL: 'teal', MDL: 'blue', HQS: 'green', VIEWER: 'grey' };

export default function Users() {
  const { user } = useAuth();
  const toast = useToast();
  const list = useApi('/users');
  const [edit, setEdit] = useState(null);
  const [temp, setTemp] = useState(null);
  const [del, setDel] = useState(null);
  const save = async () => {
    try {
      const body = { full_name: edit.full_name, title: edit.title || null, role: edit.role, auth_provider: edit.auth_provider, active: edit.active, email: edit.email };
      if (edit.id) await api.put(`/users/${edit.id}`, body);
      else { const r = await api.post('/users', body); if (r.temp_password) setTemp({ email: r.email, pwd: r.temp_password }); }
      setEdit(null); list.reload(); toast('Utente salvato');
    } catch (e) { toast(e.message, 'err'); }
  };
  const reset = async (u) => { try { const r = await api.post(`/users/${u.id}/reset-password`); setTemp({ email: u.email, pwd: r.temp_password }); } catch (e) { toast(e.message, 'err'); } };
  return (
    <div className="page">
      <div className="page-head"><div><h1>Utenti</h1><div className="sub">Sei profili: Superamministratore, Service Manager, Retail Manager (punti prelievo), MDL Manager, HQS Manager (fascicoli di autorizzazione), Consultazione. Tutti leggono tutto; ognuno modifica la propria sezione.</div></div><button className="btn" onClick={() => setEdit({ email: '', full_name: '', title: '', role: 'VIEWER', auth_provider: 'ENTRA', active: true })}>+ Nuovo utente</button></div>
      <ErrorBox error={list.error} />
      <Card flush>{!list.data ? <Loading /> : (
        <table className="t"><thead><tr><th>Utente</th><th>Profilo</th><th>Accesso</th><th>Ultimo accesso</th><th className="num">Azioni</th></tr></thead>
          <tbody>{list.data.map((u) => <tr key={u.id}><td><div className="strong">{u.title ? `${u.title} ` : ''}{u.full_name}</div><div className="small muted">{u.email}</div></td><td><Badge tone={TONE[u.role]}>{ROLE[u.role]}</Badge> {!u.active && <Badge tone="red">Disattivato</Badge>}</td><td>{PROVIDER[u.auth_provider]}{u.totp_enabled ? <span className="small muted"> · 2FA</span> : ''}</td><td className="small muted">{itDateTime(u.last_login_at) || '–'}</td><td className="num"><button className="btn sm ghost" onClick={() => setEdit(u)}>Modifica</button> {u.auth_provider !== 'ENTRA' && <button className="btn sm ghost" onClick={() => reset(u)}>Reset password</button>} {u.id !== user.id && !u.last_login_at && <button className="btn sm danger" onClick={() => setDel(u)}>Elimina</button>}</td></tr>)}</tbody></table>
      )}</Card>
      {edit && <Modal title={edit.id ? 'Modifica utente' : 'Nuovo utente'} onClose={() => setEdit(null)} footer={<><button className="btn ghost" onClick={() => setEdit(null)}>Annulla</button><button className="btn" onClick={save}>Salva</button></>}>
        <div className="form-grid">
          <Field label="Titolo"><input value={edit.title || ''} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="Dott." /></Field>
          <Field label="Nome e cognome"><input value={edit.full_name} onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} /></Field>
          <Field label="Email (account Microsoft 365)" className="span2"><input type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
          <Field label="Profilo" help={ROLE_HELP[edit.role]} className="span2"><select value={edit.role} disabled={edit.id === user.id} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>{Object.entries(ROLE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Metodo di accesso"><select value={edit.auth_provider} onChange={(e) => setEdit({ ...edit, auth_provider: e.target.value })}>{Object.entries(PROVIDER).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          {edit.id && edit.id !== user.id && <Field label="Attivo" className="inline"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> account abilitato</Field>}
        </div>
      </Modal>}
      {temp && <Modal title="Password temporanea" onClose={() => setTemp(null)} footer={<button className="btn" onClick={() => setTemp(null)}>Chiudi</button>}><p>Comunica all'utente <b>{temp.email}</b> la password temporanea (va cambiata al primo accesso):</p><p className="mono" style={{ fontSize: 18, background: 'var(--teal-050)', padding: 12, borderRadius: 8 }}>{temp.pwd}</p></Modal>}
      {del && <ConfirmModal danger title="Elimina utente" text={`Eliminare ${del.full_name}? Possibile solo senza attività registrata; altrimenti disattivalo.`} confirmText="Elimina" onClose={() => setDel(null)} onConfirm={async () => { await api.del(`/users/${del.id}`); list.reload(); toast('Utente eliminato'); }} />}
    </div>
  );
}
