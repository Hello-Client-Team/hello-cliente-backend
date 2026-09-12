import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("PostgreSQL migration enforces active-match uniqueness, revocation integrity and outbox atomicity", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(
      await readFile(
        new URL(
          "../prisma/migrations/20260909000000_init/migration.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const merchant = "00000000-0000-4000-8000-000000000001",
      developer = "00000000-0000-4000-8000-000000000002",
      project = "00000000-0000-4000-8000-000000000003",
      match = "00000000-0000-4000-8000-000000000004";
    await pg.query(
      `INSERT INTO users(id,role,name,email,updated_at) VALUES ($1,'MERCHANT','Lojista',NULL,NOW()),($2,'DEVELOPER','Dev','dev@example.com',NOW())`,
      [merchant, developer],
    );
    await pg.query(
      `INSERT INTO merchants(user_id,whatsapp,password_hash,business_name,business_sector) VALUES ($1,'+5511999999999','test-hash','Loja','Varejo')`,
      [merchant],
    );
    await pg.query(
      `INSERT INTO projects(id,developer_id,title,category,description,production_url,demo_url,status,updated_at) VALUES ($1,$2,'Sistema','Vendas','Description','https://example.com','https://example.com','APPROVED',NOW())`,
      [project, developer],
    );
    const insert = `INSERT INTO matches(id,merchant_id,project_id,terms_version,terms_accepted_at,adopted_at,production_url_snapshot) VALUES ($1,$2,$3,'1.0',NOW(),NOW(),'https://example.com')`;
    await pg.query(insert, [match, merchant, project]);
    await assert.rejects(
      pg.query(insert, [
        "00000000-0000-4000-8000-000000000005",
        merchant,
        project,
      ]),
    );
    await assert.rejects(
      pg.query(`UPDATE matches SET status='REVOKED' WHERE id=$1`, [match]),
    );
    await assert.rejects(
      pg.transaction(async (tx) => {
        await tx.query(
          `UPDATE matches SET status='REVOKED',revoked_at=NOW() WHERE id=$1`,
          [match],
        );
        await tx.query(
          `INSERT INTO outbox_events(id,revocation_id,type,payload) VALUES ($1,$2,'merchant.revoked.v1','{}')`,
          [
            "00000000-0000-4000-8000-000000000006",
            "00000000-0000-4000-8000-000000000007",
          ],
        );
      }),
    );
    const result = await pg.query<{ status: string }>(
      `SELECT status FROM matches WHERE id=$1`,
      [match],
    );
    assert.equal(result.rows[0]!.status, "ACTIVE");
    const rls = await pg.query<{ relrowsecurity: boolean }>(
      `SELECT relrowsecurity FROM pg_class WHERE relname='users'`,
    );
    assert.equal(rls.rows[0]!.relrowsecurity, true);
    await pg.exec(
      `CREATE ROLE anon NOLOGIN; GRANT SELECT ON users TO anon; SET ROLE anon;`,
    );
    const blocked = await pg.query(`SELECT id FROM users`);
    assert.equal(blocked.rows.length, 0);
    await pg.exec(`RESET ROLE;`);
    await pg.exec(
      await readFile(
        new URL("../scripts/supabase-runtime-role.sql", import.meta.url),
        "utf8",
      ),
    );
    await pg.exec(`SET ROLE hello_runtime;`);
    const allowed = await pg.query(`SELECT id FROM users`);
    assert.equal(allowed.rows.length, 2);
    await pg.exec(`RESET ROLE;`);
  } finally {
    await pg.close();
  }
});
