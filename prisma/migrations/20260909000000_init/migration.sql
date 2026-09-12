-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('MERCHANT', 'DEVELOPER', 'ADMIN');

-- CreateEnum
CREATE TYPE "OAuthProvider" AS ENUM ('GITHUB', 'LINKEDIN');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ModerationDecision" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "RevocationStatus" AS ENUM ('PENDING_NOTIFICATION', 'AWAITING_DELETION', 'DECLARED_DELETED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "HealthCheckResult" AS ENUM ('SUCCESS', 'HTTP_ERROR', 'TIMEOUT', 'NETWORK_ERROR');

-- CreateTable
CREATE TABLE "users" (
    "signup_terms_version" VARCHAR(50),
    "signup_terms_accepted_at" TIMESTAMPTZ(3),
    "admin_password_hash" VARCHAR(60),
    "id" UUID NOT NULL,
    "role" "UserRole" NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "email" VARCHAR(254),
    "email_verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchants" (
    "user_id" UUID NOT NULL,
    "whatsapp" VARCHAR(16) NOT NULL,
    "password_hash" VARCHAR(60) NOT NULL,
    "whatsapp_verified_at" TIMESTAMPTZ(3),
    "business_name" VARCHAR(180) NOT NULL,
    "business_sector" VARCHAR(100) NOT NULL,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "oauth_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "OAuthProvider" NOT NULL,
    "provider_account_id" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "health_lease_until" TIMESTAMPTZ(3),
    "health_lease_token" VARCHAR(255),
    "id" UUID NOT NULL,
    "developer_id" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "description" TEXT NOT NULL,
    "production_url" TEXT NOT NULL,
    "demo_url" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PENDING',
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "last_health_check_at" TIMESTAMPTZ(3),
    "next_health_check_at" TIMESTAMPTZ(3),
    "suspended_at" TIMESTAMPTZ(3),
    "suspension_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderations" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "administrator_id" UUID NOT NULL,
    "decision" "ModerationDecision" NOT NULL,
    "justification" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matches" (
    "production_url_snapshot" TEXT NOT NULL,
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'ACTIVE',
    "terms_version" VARCHAR(50) NOT NULL,
    "terms_accepted_at" TIMESTAMPTZ(3) NOT NULL,
    "adopted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revocations" (
    "notification_body" TEXT NOT NULL,
    "id" UUID NOT NULL,
    "match_id" UUID NOT NULL,
    "status" "RevocationStatus" NOT NULL DEFAULT 'PENDING_NOTIFICATION',
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notification_accepted_at" TIMESTAMPTZ(3),
    "deletion_deadline_at" TIMESTAMPTZ(3) NOT NULL,
    "deletion_declared_at" TIMESTAMPTZ(3),
    "recipient_email" VARCHAR(254) NOT NULL,
    "provider_message_id" VARCHAR(255),
    "notification_version" VARCHAR(50) NOT NULL,
    "evidence_reference" TEXT,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "revocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "revocation_id" UUID NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_until" TIMESTAMPTZ(3),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(3),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_checks" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "checked_url" TEXT NOT NULL,
    "result" "HealthCheckResult" NOT NULL,
    "http_status" INTEGER,
    "duration_ms" INTEGER NOT NULL,
    "error" TEXT,
    "checked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_attempts" (
    "id" UUID NOT NULL,
    "revocation_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMPTZ(3),
    "failure_code" VARCHAR(100),
    "message_id" VARCHAR(255) NOT NULL,

    CONSTRAINT "notification_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "merchants_whatsapp_key" ON "merchants"("whatsapp");

-- CreateIndex
CREATE INDEX "oauth_accounts_user_id_idx" ON "oauth_accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_accounts_provider_provider_account_id_key" ON "oauth_accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE INDEX "projects_developer_id_idx" ON "projects"("developer_id");

-- CreateIndex
CREATE INDEX "projects_status_category_idx" ON "projects"("status", "category");

-- CreateIndex
CREATE INDEX "projects_status_next_health_check_at_idx" ON "projects"("status", "next_health_check_at");

-- CreateIndex
CREATE INDEX "moderations_project_id_created_at_idx" ON "moderations"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "moderations_administrator_id_idx" ON "moderations"("administrator_id");

-- CreateIndex
CREATE INDEX "matches_merchant_id_status_idx" ON "matches"("merchant_id", "status");

-- CreateIndex
CREATE INDEX "matches_project_id_status_idx" ON "matches"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "revocations_match_id_key" ON "revocations"("match_id");

-- CreateIndex
CREATE INDEX "revocations_status_deletion_deadline_at_idx" ON "revocations"("status", "deletion_deadline_at");

-- CreateIndex
CREATE INDEX "outbox_events_status_next_attempt_at_idx" ON "outbox_events"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "outbox_events_status_locked_until_idx" ON "outbox_events"("status", "locked_until");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_revocation_id_type_key" ON "outbox_events"("revocation_id", "type");

-- CreateIndex
CREATE INDEX "health_checks_project_id_checked_at_idx" ON "health_checks"("project_id", "checked_at");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_revoked_at_idx" ON "sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "notification_attempts_revocation_id_started_at_idx" ON "notification_attempts"("revocation_id", "started_at");

-- AddForeignKey
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_developer_id_fkey" FOREIGN KEY ("developer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderations" ADD CONSTRAINT "moderations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderations" ADD CONSTRAINT "moderations_administrator_id_fkey" FOREIGN KEY ("administrator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revocations" ADD CONSTRAINT "revocations_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_revocation_id_fkey" FOREIGN KEY ("revocation_id") REFERENCES "revocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_checks" ADD CONSTRAINT "health_checks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_attempts" ADD CONSTRAINT "notification_attempts_revocation_id_fkey" FOREIGN KEY ("revocation_id") REFERENCES "revocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Complemento da migration inicial gerada pelo Prisma.
-- Copiar para o FINAL do migration.sql antes de aplicar a migration.

CREATE UNIQUE INDEX matches_one_active_per_merchant_project
ON matches (merchant_id, project_id)
WHERE status = 'ACTIVE';

ALTER TABLE users
  ADD CONSTRAINT users_email_required_for_staff
  CHECK (role = 'MERCHANT' OR email IS NOT NULL),
  ADD CONSTRAINT users_email_normalized
  CHECK (email IS NULL OR (email = lower(btrim(email)) AND length(email) > 0));

ALTER TABLE merchants
  ADD CONSTRAINT merchants_whatsapp_e164
  CHECK (whatsapp ~ '^\+[1-9][0-9]{1,14}$');

ALTER TABLE matches
  ADD CONSTRAINT matches_revocation_state
  CHECK ((status = 'ACTIVE' AND revoked_at IS NULL)
      OR (status = 'REVOKED' AND revoked_at IS NOT NULL)),
  ADD CONSTRAINT matches_revocation_chronology
  CHECK (revoked_at IS NULL OR revoked_at >= adopted_at),
  ADD CONSTRAINT matches_terms_chronology
  CHECK (terms_accepted_at <= adopted_at);

ALTER TABLE projects
  ADD CONSTRAINT projects_nonnegative_failures CHECK (consecutive_failures >= 0),
  ADD CONSTRAINT projects_suspension_state
  CHECK ((status = 'SUSPENDED' AND suspended_at IS NOT NULL AND suspension_reason IS NOT NULL)
      OR (status <> 'SUSPENDED' AND suspended_at IS NULL AND suspension_reason IS NULL));

ALTER TABLE revocations
  ADD CONSTRAINT revocations_48_hour_deadline
  CHECK (deletion_deadline_at = requested_at + interval '48 hours'),
  ADD CONSTRAINT revocations_declaration_state
  CHECK ((status = 'DECLARED_DELETED' AND deletion_declared_at IS NOT NULL)
      OR (status <> 'DECLARED_DELETED' AND deletion_declared_at IS NULL)),
  ADD CONSTRAINT revocations_declaration_chronology
  CHECK (deletion_declared_at IS NULL OR deletion_declared_at >= requested_at);

ALTER TABLE outbox_events
  ADD CONSTRAINT outbox_nonnegative_attempts CHECK (attempts >= 0),
  ADD CONSTRAINT outbox_publication_state
  CHECK ((status = 'PUBLISHED' AND published_at IS NOT NULL)
      OR (status <> 'PUBLISHED' AND published_at IS NULL));

ALTER TABLE health_checks
  ADD CONSTRAINT health_checks_nonnegative_duration CHECK (duration_ms >= 0),
  ADD CONSTRAINT health_checks_http_range CHECK (http_status BETWEEN 100 AND 599),
  ADD CONSTRAINT health_checks_response_state
  CHECK ((result IN ('SUCCESS', 'HTTP_ERROR') AND http_status IS NOT NULL)
      OR (result IN ('TIMEOUT', 'NETWORK_ERROR') AND http_status IS NULL));


ALTER TABLE users ADD CONSTRAINT users_admin_credential_role CHECK (role = 'ADMIN' OR admin_password_hash IS NULL);
ALTER TABLE sessions ADD CONSTRAINT sessions_expiry CHECK (expires_at > created_at);

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "users" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON TABLE "users" FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON TABLE "users" FROM authenticated; END IF;
END $$;

ALTER TABLE "merchants" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "merchants" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON TABLE "merchants" FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON TABLE "merchants" FROM authenticated; END IF;
END $$;

ALTER TABLE "oauth_accounts" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "oauth_accounts" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON TABLE "oauth_accounts" FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON TABLE "oauth_accounts" FROM authenticated; END IF;
END $$;

ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "projects" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON TABLE "projects" FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON TABLE "projects" FROM authenticated; END IF;
END $$;

ALTER TABLE "moderations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "moderations" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON TABLE "moderations" FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON TABLE "moderations" FROM authenticated; END IF;
END $$;

ALTER TABLE "matches" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "matches" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON TABLE "matches" FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON TABLE "matches" FROM authenticated; END IF;
END $$;

ALTER TABLE "revocations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "revocations" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON TABLE "revocations" FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON TABLE "revocations" FROM authenticated; END IF;
END $$;

ALTER TABLE "outbox_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "outbox_events" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON TABLE "outbox_events" FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON TABLE "outbox_events" FROM authenticated; END IF;
END $$;

ALTER TABLE "health_checks" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "health_checks" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON TABLE "health_checks" FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON TABLE "health_checks" FROM authenticated; END IF;
END $$;

ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "sessions" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON TABLE "sessions" FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON TABLE "sessions" FROM authenticated; END IF;
END $$;

ALTER TABLE "notification_attempts" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "notification_attempts" FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON TABLE "notification_attempts" FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON TABLE "notification_attempts" FROM authenticated; END IF;
END $$;
