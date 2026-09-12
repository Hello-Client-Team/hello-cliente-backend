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
