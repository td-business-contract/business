import { one } from '../db.js';
import { config } from '../config.js';
import { forbidden, HttpError } from './util.js';
import { canEditKind, canEditDossier } from './rules.js';

export const USER_COLS = 'id, email, full_name, title, role, auth_provider, must_change_password, totp_enabled, active, last_login_at, created_at';

export async function loadUser(req, _res, next) {
  try {
    const id = req.session?.userId;
    if (id) {
      const u = await one(`SELECT ${USER_COLS} FROM users WHERE id=$1`, [id]);
      if (u && u.active) req.user = u;
      else req.session.userId = null;
    }
    next();
  } catch (e) { next(e); }
}

const ONBOARDING_PATHS = ['/api/auth/me', '/api/auth/logout', '/api/auth/change-password', '/api/auth/totp/setup', '/api/auth/totp/enable'];

export function onboardingState(req) {
  const u = req.user;
  if (!u) return null;
  const local = req.session.authMethod === 'LOCAL';
  if (local && u.must_change_password) return 'PASSWORD_CHANGE_REQUIRED';
  if (local && config.requireTotpForAdmins && u.role === 'ADMIN' && !u.totp_enabled) return 'TOTP_SETUP_REQUIRED';
  return null;
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'Sessione scaduta o non autenticata'));
  const st = onboardingState(req);
  if (st && !ONBOARDING_PATHS.includes(req.originalUrl.split('?')[0])) {
    const e = new HttpError(403, st === 'PASSWORD_CHANGE_REQUIRED' ? 'Cambio password obbligatorio' : 'Attivazione verifica in due passaggi obbligatoria');
    e.code = st;
    return next(e);
  }
  next();
}

export const isAdmin = (u) => u?.role === 'ADMIN';
// Chi gestisce almeno una sezione (anagrafiche partner incluse)
export const isManager = (u) => ['ADMIN', 'SERVICE', 'RETAIL', 'MDL', 'HQS'].includes(u?.role);
export const requireAdmin = (req, _res, next) => (isAdmin(req.user) ? next() : next(forbidden('Riservato al Superamministratore')));
export const requireManager = (req, _res, next) => (isManager(req.user) ? next() : next(forbidden('Operazione riservata ai manager di sezione')));
export const requireKind = (kind, user) => { if (!canEditKind(user, kind)) throw forbidden('Non hai i permessi su questa sezione'); };
export const requireDossier = (user) => { if (!canEditDossier(user)) throw forbidden('Il fascicolo è riservato a HQS Manager e Retail Manager'); };
