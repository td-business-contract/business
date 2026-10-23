// Configurazione da variabili d'ambiente
const env = process.env;

export const config = {
  port: Number(env.PORT || 3000),
  baseUrl: (env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  databaseUrl: env.DATABASE_URL || 'postgres://postgres:dev@localhost:5432/business',
  sessionSecret: env.SESSION_SECRET || 'dev-only-change-me',
  // chiave per cifrare le credenziali dei portali (AES-256-GCM); in produzione va impostata (render.yaml la genera)
  credentialsKey: env.CREDENTIALS_KEY || env.SESSION_SECRET || 'dev-only-change-me',
  secureCookies: env.NODE_ENV === 'production',
  sessionHours: Number(env.SESSION_HOURS || 10),
  requireTotpForAdmins: (env.REQUIRE_TOTP_FOR_ADMINS || 'true') === 'true',
  maxUploadMb: Number(env.MAX_UPLOAD_MB || 40),
  sofficeBin: env.SOFFICE_BIN || 'soffice',
  entra: {
    tenantId: env.ENTRA_TENANT_ID || '',
    clientId: env.ENTRA_CLIENT_ID || '',
    clientSecret: env.ENTRA_CLIENT_SECRET || '',
    get enabled() { return Boolean(this.tenantId && this.clientId && this.clientSecret); },
  },
  seed: {
    adminEmail: env.SEED_ADMIN_EMAIL || '',
    adminName: env.SEED_ADMIN_NAME || 'Amministratore',
    adminPassword: env.SEED_ADMIN_PASSWORD || '',
  },
  appName: 'Toscana Diagnostica · Business',
};

if (env.NODE_ENV === 'production') {
  if (config.sessionSecret === 'dev-only-change-me') throw new Error('SESSION_SECRET obbligatorio in produzione');
  if (!env.CREDENTIALS_KEY) console.warn('[config] CREDENTIALS_KEY non impostata: le credenziali dei portali vengono cifrate con SESSION_SECRET');
}
