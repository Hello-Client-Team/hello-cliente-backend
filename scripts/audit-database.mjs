// Read-only remote audit; migrations run only in an isolated in-memory database.
import 'dotenv/config';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';

const directory = new URL('../prisma/migrations/', import.meta.url);
const migrations = readdirSync(directory, { withFileTypes: true })
  .filter(e => e.isDirectory()).map(e => {
    const sql = readFileSync(new URL(`${e.name}/migration.sql`, directory), 'utf8');
    return { name: e.name, sql, checksum: createHash('sha256').update(sql).digest('hex') };
  }).sort((a, b) => a.name.localeCompare(b.name));
const reference = new PGlite();
const queries = {
  tables: `SELECT c.relname AS name, c.relrowsecurity AS rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname <> '_prisma_migrations' ORDER BY 1`,
  columns: `SELECT c.relname AS table_name, a.attname AS name, format_type(a.atttypid,a.atttypmod) AS type, a.attnotnull AS not_null, pg_get_expr(d.adbin,d.adrelid) AS default_value FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='public' AND c.relkind='r' AND c.relname <> '_prisma_migrations' AND a.attnum>0 AND NOT a.attisdropped ORDER BY 1,2`,
  constraints: `SELECT c.relname AS table_name, k.conname AS name, pg_get_constraintdef(k.oid) AS definition, k.convalidated AS validated FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname <> '_prisma_migrations' ORDER BY 1,2`,
  indexes: `SELECT t.relname AS table_name, i.relname AS name, pg_get_indexdef(x.indexrelid) AS definition, x.indisvalid AS valid FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class t ON t.oid=x.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND t.relname <> '_prisma_migrations' ORDER BY 1,2`,
  enums: `SELECT t.typname AS name, e.enumlabel AS label FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' ORDER BY 1,e.enumsortorder`,
};
const report = { checkedAt: new Date().toISOString(), readOnly: true, connections: {} };
try {
  for (const migration of migrations) await reference.exec(migration.sql);
  const expected = {};
  for (const [key, sql] of Object.entries(queries)) expected[key] = (await reference.query(sql)).rows;
  const tables = expected.tables.map(t => t.name);
  for (const key of ['DATABASE_URL', 'DIRECT_URL']) {
    const result = report.connections[key] = {};
    let client;
    try {
      const url = new URL(process.env[key]);
      for (const param of ['sslmode','sslcert','sslkey','sslrootcert']) url.searchParams.delete(param);
      client = new pg.Client({ connectionString: url.toString(),
        ssl: { rejectUnauthorized: true, ...(process.env.DB_SSL_CA_FILE ? { ca: readFileSync(process.env.DB_SSL_CA_FILE,'utf8') } : {}) },
        connectionTimeoutMillis: 10000, statement_timeout: 15000 });
      await client.connect();
      await client.query('BEGIN READ ONLY');
      await client.query('SET LOCAL search_path TO public');
      result.identity = (await client.query(`SELECT current_user, current_database(), rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolinherit, has_schema_privilege(current_user,'public','CREATE') AS schema_create FROM pg_roles WHERE rolname=current_user`)).rows[0];
      result.structure = {};
      for (const [category, sql] of Object.entries(queries)) {
        const actual = (await client.query(sql)).rows;
        const normalized = row => JSON.stringify(row).replaceAll('public.', '');
        const actualSet = new Set(actual.map(normalized));
        const expectedSet = new Set(expected[category].map(normalized));
        result.structure[category] = { expected: expected[category].length,
          missingOrDifferent: expected[category].filter(row => !actualSet.has(normalized(row))),
          extraOrDifferent: actual.filter(row => !expectedSet.has(normalized(row))) };
      }
      result.roles = (await client.query(`SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolinherit FROM pg_roles WHERE rolname IN ('hello_app','hello_runtime') ORDER BY rolname`)).rows;
      result.memberships = (await client.query(`SELECT member.rolname AS member, parent.rolname AS granted_role, m.admin_option FROM pg_auth_members m JOIN pg_roles member ON member.oid=m.member JOIN pg_roles parent ON parent.oid=m.roleid WHERE member.rolname IN (current_user,'hello_runtime','hello_app')`)).rows;
      result.owners = (await client.query(`SELECT tablename, tableowner FROM pg_tables WHERE schemaname='public' AND tablename=ANY($1) ORDER BY tablename`, [tables])).rows;
      result.policies = (await client.query(`SELECT tablename, policyname, permissive, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname='public' AND tablename=ANY($1) ORDER BY tablename,policyname`, [tables])).rows;
      result.privileges = (await client.query(`SELECT r.rolname, t AS table_name, has_table_privilege(r.oid,format('public.%I',t),'SELECT') AS select, has_table_privilege(r.oid,format('public.%I',t),'INSERT') AS insert, has_table_privilege(r.oid,format('public.%I',t),'UPDATE') AS update, has_table_privilege(r.oid,format('public.%I',t),'DELETE') AS delete, has_table_privilege(r.oid,format('public.%I',t),'TRUNCATE') AS truncate FROM pg_roles r CROSS JOIN unnest($1::text[]) t WHERE r.rolname IN (current_user,'hello_runtime','anon','authenticated') AND to_regclass(format('public.%I',t)) IS NOT NULL ORDER BY 1,2`,[tables])).rows;
      await client.query('SAVEPOINT migration_history');
      try {
        const history = (await client.query('SELECT migration_name, checksum, finished_at, rolled_back_at FROM public._prisma_migrations ORDER BY started_at')).rows;
        result.migrations = { history, local: migrations.map(m => ({ name:m.name, checksumMatches:history.some(h=>h.migration_name===m.name && h.checksum===m.checksum && h.finished_at && !h.rolled_back_at) })) };
      } catch (e) { await client.query('ROLLBACK TO SAVEPOINT migration_history'); result.migrations = { errorCode:e.code }; }
      result.selectProbes = [];
      for (const table of tables) {
        await client.query('SAVEPOINT probe');
        try { await client.query(`SELECT * FROM public."${table}" LIMIT 0`); result.selectProbes.push({ table, ok:true }); }
        catch(e) { await client.query('ROLLBACK TO SAVEPOINT probe'); result.selectProbes.push({table,ok:false,errorCode:e.code}); }
      }
      await client.query('ROLLBACK');
    } catch(e) { result.error = { code:e.code ?? 'AUDIT_ERROR' }; }
    finally { await client?.end(); }
  }
  writeFileSync(new URL('../docs/database-audit.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
} finally { await reference.close(); }
