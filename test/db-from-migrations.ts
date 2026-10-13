import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from '../db/schema.js';

/**
 * A test database built by replaying THE SHIPPED MIGRATIONS, in order.
 *
 * Not a hand-written CREATE TABLE. A fixture someone typed from memory is half
 * a pair: the test asserts against the shape the author believed the migration
 * had, so a migration that ships the wrong column keeps every test green and
 * the drift is invisible until production. Replaying `drizzle/*.sql` makes the
 * fixture derived from the artifact that actually runs.
 */
export function migrationFiles(dir = join(import.meta.dirname, '..', 'drizzle')): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => join(dir, f));
}

export function migrationSql(): string[] {
  return migrationFiles().flatMap((f) =>
    readFileSync(f, 'utf8')
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export async function makeMigratedDb() {
  const client = createClient({ url: ':memory:' });
  for (const stmt of migrationSql()) await client.execute(stmt);
  return drizzle(client, { schema });
}
