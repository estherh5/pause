import { describe, it, expect } from 'vitest';
import { createClient } from '@libsql/client';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { invites } from '../db/schema.js';
import { migrationSql } from './db-from-migrations.js';

/**
 * The migration and the schema declaration must agree — IN BOTH DIRECTIONS.
 *
 * These are two hand-maintained copies of one fact. A one-way check ("every
 * declared column exists in the DDL") passes happily while the migration ships
 * an extra column nobody declared, and the reverse check passes while the
 * declaration grows a column the migration never creates — which is a
 * production 500 the moment anything selects it. Both directions, derived from
 * both artifacts, or this is half a pair.
 */
async function migratedColumns(table: string) {
  const client = createClient({ url: ':memory:' });
  for (const stmt of migrationSql()) await client.execute(stmt);
  const info = await client.execute(`select name, type, "notnull", pk from pragma_table_info('${table}')`);
  // `origin: 'c'` = created by an explicit CREATE INDEX. SQLite also reports
  // `sqlite_autoindex_invites_1` here — the implicit unique index behind the
  // TEXT primary key — which is not one of ours and would make the assertion
  // below drift the moment the PK changed shape.
  const idx = await client.execute(`select name, "unique", origin from pragma_index_list('${table}')`);
  return {
    columns: new Map(
      info.rows.map((r) => [String(r.name), { type: String(r.type).toUpperCase(), notNull: Number(r.notnull) === 1, pk: Number(r.pk) > 0 }]),
    ),
    uniqueIndexes: new Set(
      idx.rows.filter((r) => Number(r.unique) === 1 && String(r.origin) === 'c').map((r) => String(r.name)),
    ),
  };
}

/** What `db/schema.ts` says, read out of drizzle rather than retyped. */
function declaredColumns() {
  const cfg = getTableConfig(invites);
  return new Map(
    cfg.columns.map((c) => [c.name, { type: c.getSQLType().toUpperCase(), notNull: c.notNull, pk: c.primary }]),
  );
}

describe('invites: db/schema.ts vs the shipped migration', () => {
  it('declares the same column NAMES, both directions', async () => {
    const { columns } = await migratedColumns('invites');
    const declared = declaredColumns();
    expect([...declared.keys()].sort()).toEqual([...columns.keys()].sort());
  });

  it('agrees on type, NOT NULL and primary key for every column', async () => {
    const { columns } = await migratedColumns('invites');
    for (const [name, d] of declaredColumns()) {
      const m = columns.get(name);
      expect(m, `${name} is declared but the migration never creates it`).toBeDefined();
      expect(m!.type, `${name} type`).toBe(d.type);
      expect(m!.notNull, `${name} NOT NULL`).toBe(d.notNull);
      expect(m!.pk, `${name} primary key`).toBe(d.pk);
    }
  });

  it('the two identifying columns are UNIQUE in the database, not just in the declaration', async () => {
    // A `.unique()` in schema.ts is a promise; an index in the DDL is what
    // keeps it. Two invitations for one address, or two rows sharing a token,
    // are both admission bugs.
    const { uniqueIndexes } = await migratedColumns('invites');
    expect([...uniqueIndexes].sort()).toEqual(['invites_email_unique', 'invites_token_unique']);
  });

  it('the unique indexes actually REFUSE a duplicate', async () => {
    // The index existing is not the same as the index biting. Proven against
    // the real engine rather than inferred from `sqlite_master`.
    const client = createClient({ url: ':memory:' });
    for (const stmt of migrationSql()) await client.execute(stmt);
    const row = (over: string) =>
      `insert into invites (id, email, token, created_at, expires_at) values (${over})`;
    await client.execute(row(`'a','one@x.co','tok-a',1,2`));
    await expect(client.execute(row(`'b','one@x.co','tok-b',1,2`))).rejects.toThrow(/UNIQUE/i);
    await expect(client.execute(row(`'c','two@x.co','tok-a',1,2`))).rejects.toThrow(/UNIQUE/i);
    // The control: a genuinely distinct row still goes in, so the two
    // rejections above are the constraints and not a broken insert.
    await client.execute(row(`'d','two@x.co','tok-d',1,2`));
  });

  it('both timestamps are NOT NULL and neither carries a DEFAULT', async () => {
    // A default on one of them lets a row exist whose expiry is unrelated to
    // its creation — an invitation that outlives what anyone intended.
    const sql = migrationSql().join('\n');
    const create = sql.slice(sql.indexOf('CREATE TABLE `invites`'));
    const table = create.slice(0, create.indexOf(');') + 1);
    expect(table).toMatch(/`created_at` integer NOT NULL/);
    expect(table).toMatch(/`expires_at` integer NOT NULL/);
    expect(table).not.toMatch(/DEFAULT/i);
  });
});
