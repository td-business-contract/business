import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool, one, q } from './db.js';
import { config } from './config.js';
import { DEFAULT_SETTINGS } from './lib/rules.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export async function migrate() {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())');
  const done = new Set((await pool.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(sql);
      await c.query('INSERT INTO schema_migrations(name) VALUES ($1)', [f]);
      await c.query('COMMIT');
      console.log(`[migrate] applicata ${f}`);
    } catch (e) {
      await c.query('ROLLBACK');
      throw new Error(`Migrazione ${f} fallita: ${e.message}`);
    } finally {
      c.release();
    }
  }
  await seed();
}

async function seed() {
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    await q('INSERT INTO app_settings(key, value) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING', [k, v]);
  }
  // Primo Superamministratore: accesso Microsoft 365 o password
  if (config.seed.adminEmail) {
    const ex = await one('SELECT id FROM users WHERE lower(email)=lower($1)', [config.seed.adminEmail]);
    if (!ex) {
      if (!config.seed.adminPassword || config.seed.adminPassword.length < 12) {
        throw new Error('SEED_ADMIN_PASSWORD obbligatoria (min 12 caratteri) per creare il primo amministratore');
      }
      const hash = await bcrypt.hash(config.seed.adminPassword, 12);
      await q(`INSERT INTO users (email, full_name, title, role, auth_provider, password_hash, must_change_password) VALUES ($1,$2,'Dott.','ADMIN','BOTH',$3,TRUE)`,
        [config.seed.adminEmail, config.seed.adminName, hash]);
      console.log(`[seed] creato Superamministratore ${config.seed.adminEmail}`);
    }
  }
}

if (process.argv[1] && process.argv[1].endsWith('migrate.js')) {
  migrate().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
}
