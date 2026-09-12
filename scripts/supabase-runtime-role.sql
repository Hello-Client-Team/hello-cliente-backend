-- Execute after migrations as the migration owner. Passwords are configured separately.
-- Group role has no login. Runtime login inherits only the application policy.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='hello_app') THEN CREATE ROLE hello_app NOLOGIN; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='hello_runtime') THEN CREATE ROLE hello_runtime LOGIN INHERIT NOCREATEDB NOCREATEROLE NOBYPASSRLS; END IF;
END $$;
GRANT hello_app TO hello_runtime;
GRANT USAGE ON SCHEMA public TO hello_app;
REVOKE CREATE ON SCHEMA public FROM hello_runtime;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "users" TO hello_app;
DROP POLICY IF EXISTS hello_api_access ON "users";
CREATE POLICY hello_api_access ON "users" FOR ALL TO hello_app USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "merchants" TO hello_app;
DROP POLICY IF EXISTS hello_api_access ON "merchants";
CREATE POLICY hello_api_access ON "merchants" FOR ALL TO hello_app USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "oauth_accounts" TO hello_app;
DROP POLICY IF EXISTS hello_api_access ON "oauth_accounts";
CREATE POLICY hello_api_access ON "oauth_accounts" FOR ALL TO hello_app USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "projects" TO hello_app;
DROP POLICY IF EXISTS hello_api_access ON "projects";
CREATE POLICY hello_api_access ON "projects" FOR ALL TO hello_app USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "moderations" TO hello_app;
DROP POLICY IF EXISTS hello_api_access ON "moderations";
CREATE POLICY hello_api_access ON "moderations" FOR ALL TO hello_app USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "matches" TO hello_app;
DROP POLICY IF EXISTS hello_api_access ON "matches";
CREATE POLICY hello_api_access ON "matches" FOR ALL TO hello_app USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "revocations" TO hello_app;
DROP POLICY IF EXISTS hello_api_access ON "revocations";
CREATE POLICY hello_api_access ON "revocations" FOR ALL TO hello_app USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "outbox_events" TO hello_app;
DROP POLICY IF EXISTS hello_api_access ON "outbox_events";
CREATE POLICY hello_api_access ON "outbox_events" FOR ALL TO hello_app USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "health_checks" TO hello_app;
DROP POLICY IF EXISTS hello_api_access ON "health_checks";
CREATE POLICY hello_api_access ON "health_checks" FOR ALL TO hello_app USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "sessions" TO hello_app;
DROP POLICY IF EXISTS hello_api_access ON "sessions";
CREATE POLICY hello_api_access ON "sessions" FOR ALL TO hello_app USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "notification_attempts" TO hello_app;
DROP POLICY IF EXISTS hello_api_access ON "notification_attempts";
CREATE POLICY hello_api_access ON "notification_attempts" FOR ALL TO hello_app USING (true) WITH CHECK (true);

-- Configure a random runtime password in a private SQL Editor session:
-- ALTER ROLE hello_runtime PASSWORD '<GENERATED_SECRET>';
-- Never commit the populated statement or put a migration-owner password in DATABASE_URL.
