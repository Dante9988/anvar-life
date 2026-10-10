# Backend setup and security gates

This branch only permits `APP_MODE=fictional_preview`. Production mode remains disabled in code. Do not put real contact data into a preview. Live consent, notification dispatch, licensing verification process, retention policy and production launch need separate review/approval.

## Environment contract
- APP_MODE: fictional_preview
- APP_ORIGIN: exact stable HTTPS preview origin, no trailing slash/path. Loopback HTTP only for local work.
- AGENCY_ID: configured agency UUID
- SUPABASE_URL: hosted/local Supabase API URL
- SUPABASE_PUBLISHABLE_KEY: public project key, never service_role
- INTAKE_DATABASE_URL: restricted Postgres login via appropriate serverless pooler; inherit agency_intake role only. No ownership, BYPASSRLS, superuser or direct lead SELECT. Runtime rejects unsafe connection privileges. TLS certificate verification remains enabled for remote connections.
- INTAKE_HASH_SECRET: securely generated server-only value of at least 32 characters; keyed IP rate-bucket identifiers, never logged
- INTAKE_ENABLED: true only after isolated fictional environment verified
- TURNSTILE_SECRET_KEY: reserved anti-bot integration. This preview does not contain a challenge widget, so setting this secret disables intake rather than bypassing verification. Complete frontend/CSP/privacy review before enabling the integration; server verifier requires expected hostname and action lead_intake.

Missing required environment yields 503. No persistent credentials are bundled. Creating/configuring hosted credentials is a separate approved secure setup action; never enter them in messages, commit them, or bake them into dist. Do not use an unrestricted Supabase service-role key for portal data.

## Migration and invite-only owner bootstrap
1. Apply database/001_agency.sql as the migration owner in the isolated project. Supabase provides auth.users, auth.uid and the anon/authenticated/supabase_auth_admin roles.
2. Create the single agency row with its approved UUID/name.
3. Through the trusted database administration interface, insert one `owner_bootstrap` row for the exact approved Google Workspace email, agency ID, and a short expiry (for example 24 hours). This table has RLS and no client grants. It never grants domain-wide access.
4. Enable public.before_user_created as Supabase's Before User Created hook. Disable unused auth providers, including anonymous/email-password sign-in. Configure Google OAuth with exact callback URLs and internal Workspace audience where available. Only identity scopes are needed.
5. Set the app callback to APP_ORIGIN/api/auth/callback in the auth redirect allowlist. Do not allow broad arbitrary preview wildcards. Configure Google’s authorized callback from the Supabase Google-provider page.
6. On verified Google sign-in, accept_invitation binds and consumes the one-time exact-email owner bootstrap. Later access is pinned to auth user identity and active membership, not email suffix. Subsequent invitations can be created by the owner in the portal; their delivery is deliberately not sent automatically.
7. Create a restricted runtime login through approved secure tooling and grant it membership in agency_intake, no table grants. The migration role remains separate.
8. Run allow/deny tests, restore tests and actual hosted Google sign-in before treating setup as verified.

The hook must already be enabled before exposing hosted sign-in. Bootstrap authorizations expire and cannot create a second owner. Bootstrap is not a public demo login. User-edited metadata is never the source of app role/agency authority.

## Persistence and notifications
Successful intake means one transaction committed the lead, exact versioned consent text, audit event, idempotency receipt and durable notification_outbox row. Retry of the same payload/key returns the same receipt. Appointment requested is not appointment scheduled.

Outbox contains IDs/event/state rather than contact details. Live dispatch is intentionally disabled in this delivery. Before enabling, implement/verify a leased retry worker with provider idempotency and active-recipient/DNC rechecks, approved recipients and no PII in notification bodies. Pending rows must not be presented as sent. No cron or external notification service is provisioned.

## Verification boundary
PGlite executes real PostgreSQL SQL, roles and RLS locally. It is not a mock, but it does not establish hosted Supabase Auth, OAuth, pooler, deployment TLS or Vercel runtime integration. Conventional PostgreSQL CI tests use the same migration. A true external preview additionally requires separate approved Supabase infrastructure and secure environment configuration.

No fixed public demonstration identity, magic bypass header, shared password or unrestricted demo session exists. Fictional preview access uses genuine invitation-only authentication. DB integration tests create isolated test identities only inside the test database.

## Operations before live use
Approve retention periods for leads, immutable consent/audit evidence, notes, rate buckets, idempotency records and backups. Rate identifiers are keyed pseudonymous values, not raw IP logs. Purge expired rate buckets on an approved schedule. Do not silently purge consent evidence or merge identities based only on email/phone.

Select backup coverage with explicit recovery objectives. Free-tier hosted database availability does not establish managed daily backups. Test full restoration to an isolated environment and ensure revoked memberships, DNC state and deletion obligations remain enforced. Do not export production data into previews or test fixtures.
