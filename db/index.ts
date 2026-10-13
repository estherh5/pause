import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema.js';

// Production (Vercel) → Turso via TURSO_DATABASE_URL.
// Local dev → a plain SQLite file (./local.db).
// `||` (not `??`) so an empty-string override also falls back to the file.
const url = process.env.TURSO_DATABASE_URL || 'file:local.db';
const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

const client = createClient({ url, authToken });

export const db = drizzle(client, { schema });
export type DB = typeof db;
