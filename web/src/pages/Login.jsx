import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Field, ErrorBox } from '../components/ui.jsx';

export default function Login() {
  const { refresh } = useAuth();
  const loc = useLocation();
  const returnTo = '/';
  const signing = false;
  const [cfg, setCfg] = useState({ entraEnabled: false });
  const [step, setStep] = useState('pwd');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState(() => {
    const e = new URLSearchParams(window.location.search).get('error');
    return e ? new Error(e) : null;
  });
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get('/auth/config').then(setCfg).catch(() => {}); }, []);

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      if (step === 'pwd') {
        const r = await api.post('/auth/login', { email, password });
        if (r.totpRequired) { setStep('totp'); setBusy(false); return; }
      } else {
        await api.post('/auth/totp', { code });
      }
      window.history.replaceState(null, '', returnTo);
      await refresh();
    } catch (e2) { setErr(e2); }
    setBusy(false);
  };

  return (
    <div className="login">
      <div className="art">
        <img src="/logo-light.svg" alt="Toscana Diagnostica" />
        <div className="claim">Ogni partnership <span>proposta, firmata, autorizzata.</span></div>
        <div className="foot">Business · contratti di Punti Prelievo, Service di Laboratorio e Medicina del Lavoro di Toscana Diagnostica · accesso riservato</div>
      </div>
      <div className="pane">
        <form onSubmit={submit}>
          <div>
            <h1>{step === 'pwd' ? (signing ? 'Accedi per firmare' : 'Accedi') : 'Verifica in due passaggi'}</h1>
            <div className="muted" style={{ marginTop: 4 }}>
              {step === 'pwd' ? 'Accedi con il tuo account Microsoft 365 oppure con email e password.' : "Inserisci il codice a 6 cifre dell'app di autenticazione."}
            </div>
          </div>
          <ErrorBox error={err} />
          {step === 'pwd' && cfg.entraEnabled && <>
            <a className="btn ms lg" href={`/api/auth/entra/login?returnTo=${encodeURIComponent(returnTo)}`}>
              <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true"><rect x="1" y="1" width="9" height="9" fill="#f25022" /><rect x="11" y="1" width="9" height="9" fill="#7fba00" /><rect x="1" y="11" width="9" height="9" fill="#00a4ef" /><rect x="11" y="11" width="9" height="9" fill="#ffb900" /></svg>
              Accedi con Microsoft 365
            </a>
            {!signing && <div className="or">oppure con email e password</div>}
          </>}
          {(!signing || !cfg.entraEnabled || cfg.signAllowLocal) && (step === 'pwd' ? <>
            <Field label="Email"><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></Field>
            <Field label="Password"><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
            <button className="btn lg" disabled={busy}>{busy ? 'Verifica…' : 'Accedi'}</button>
          </> : (
            <>
              <Field label="Codice"><input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus required style={{ fontSize: 22, letterSpacing: '.3em', textAlign: 'center' }} /></Field>
              <button className="btn lg" disabled={busy}>{busy ? 'Verifica…' : 'Conferma'}</button>
              <button type="button" className="btn link" onClick={() => { setStep('pwd'); setCode(''); }}>Torna al login</button>
            </>
          ))}
        </form>
      </div>
    </div>
  );
}
