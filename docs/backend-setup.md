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
1. Apply database/001_agency.sql, then database/002_notification_preview.sql as the migration owner in the isolated project. Supabase provides auth.users, auth.uid and the anon/authenticated/supabase_auth_admin roles.
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

Outbox contains IDs/event/state rather than contact details. Live dispatch is intentionally disabled in this delivery. A fictional-only dispatcher is implemented in server/notifications.mjs with a memory mail sink. database/002_notification_preview.sql provides execute-only agency_outbox capabilities: lease batches using SKIP LOCKED, recheck current recipient authorization and DNC, acknowledge matching unexpired leases, and retry with exponential delay up to five attempts. It records simulated separately from sent; stale or lost acknowledgements are reported uncertain. Sink messages contain only recipient account email, generic event text and authenticated portal link, never lead contact data. No cron, runtime worker credential or external notification provider is provisioned.

For an isolated test, construct createPostgresOutboxStore using a restricted agency_outbox connection, createMemoryMailSink, and dispatchPreviewNotifications with mode fictional_preview, enabled true, and the exact origin. This is a test harness/library entrypoint, not a public API. The default is disabled. Production mode and external transports are rejected. Before live dispatch, obtain approval, add a provider adapter with idempotency and bounded timeout, approve recipients, and verify recovery and delivery evidence. Pending or simulated rows must never be presented as sent.

## Verification boundary
PGlite executes real PostgreSQL SQL, roles and RLS locally. It is not a mock, but it does not establish hosted Supabase Auth, OAuth, pooler, deployment TLS or Vercel runtime integration. Conventional PostgreSQL CI tests use the same migration. A true external preview additionally requires separate approved Supabase infrastructure and secure environment configuration.

No fixed public demonstration identity, magic bypass header, shared password or unrestricted demo session exists. Fictional preview access uses genuine invitation-only authentication. DB integration tests create isolated test identities only inside the test database.

## Operations before live use
Approve retention periods for leads, immutable consent/audit evidence, notes, rate buckets, idempotency records and backups. Rate identifiers are keyed pseudonymous values, not raw IP logs. Purge expired rate buckets on an approved schedule. Do not silently purge consent evidence or merge identities based only on email/phone.

Select backup coverage with explicit recovery objectives. Free-tier hosted database availability does not establish managed daily backups. Test full restoration to an isolated environment and ensure revoked memberships, DNC state and deletion obligations remain enforced. Do not export production data into previews or test fixtures.

## Kixie CRM extension: isolated preview only

Apply `database/003_kixie_crm.sql` after 001 and 002 in a new disposable or explicitly approved isolated preview database. The migration seeds no vendor account, number, source, policy, identity mapping or credentials. Never apply it to production as part of reviewing this feature branch.

The extension adds normalized calls and append-only event metadata, owner-reviewed phone-match candidates, agent mappings, vendor sources/tracking numbers, internal notes/callback preparations, routing verification, separate vendor/telephony costs, explicit policy production, compensation schedules/estimates and verified financial/retention facts. `agency_kixie` has no table access and may call only ingestion. Existing owner/admin and assigned-agent permissions remain intact; unlinked call identity review is owner-only.

### Inbound authentication and runtime identity

1. Generate a distinct high-entropy base64url `KIXIE_WEBHOOK_SECRET` of 32–128 characters through an approved secure configuration workflow. Do not use a Kixie API key as the inbound secret. Never put either credential in source, chat, webhook URLs, screenshots or logs.
2. When account setup is separately approved, configure the documented custom header `X-Kixie-Webhook-Token` on each webhook and a clean HTTPS endpoint `/api/integrations/kixie`. Kixie documents configurable HTTP headers; this application does not claim provider-generated HMAC signatures. Actual header delivery and account plan entitlement remain unverified.
3. Provision a unique restricted PostgreSQL LOGIN for this one agency, with inherited membership in `agency_kixie`, no direct table grants, no ownership, no superuser/BYPASSRLS, and no other application runtime roles. Insert its exact PostgreSQL `session_user` name and agency UUID into `kixie_ingestion_accounts` using the migration owner. `SET ROLE` does not change that binding. Do not bind the migration owner. Store its connection URI only in `KIXIE_DATABASE_URL` through the secure environment mechanism; server role guards reject unsafe grants.
4. Set the expected numeric `KIXIE_BUSINESS_ID`; both envelope and call-details business IDs must match. Runtime agency comes only from `AGENCY_ID` and the database binding. No payload agency field is trusted.
5. `KIXIE_PREVIEW_ENABLED=true` and `KIXIE_FIXTURE_ONLY=true` work only with the existing configured `APP_MODE=fictional_preview`. The code additionally accepts only reserved North American `555-0100`–`555-0199` fictional phone numbers and `example.invalid`/`example.test` agent identities. There is no live-collection switch in this release. Existing public intake remains separately disabled by default.

No Kixie API key is needed for local normalized-fixture tests. Click-to-call, SMS, recording playback, number purchase/provisioning and external follow-up have no enabled transport here. The supported future call API is documented in the playbook, but this branch neither calls it nor supplies a `tel:` substitute.

### Verified event subset and timestamps

The adapter supports the documented `data.callDetails` envelopes for `startcall`, `answeredcall` and `endcall`, with `data.hookevent` as discriminator. Only `calltype=incoming` is accepted. Ringing is never marked missed merely because the start sample contains `callstatus=missed`. Unknown end statuses remain unknown. `disposition`, `voicemail`, `scheduledactivity`, SMS and AI summaries are documented Kixie capabilities but intentionally unsupported by this first adapter; internal CRM dispositions are entered explicitly by the agent.

ISO timestamps must have an explicit timezone. Legacy `YYYY-MM-DD HH:mm:ss` values are rejected unless the account's UTC semantics are separately verified and `KIXIE_LEGACY_TIMESTAMPS_UTC=confirmed` is set. Do not assume the server timezone. Events older than seven days or over five minutes in the future require an operator-reviewed import instead of silently widening the acceptance window. Kixie delivery IDs, retry intervals, maximum attempts, ordering guarantees and signed delivery timestamps were not verified.

Idempotency keys are application-derived from expected business, call ID, event type and occurrence time; normalized payloads have a separate hash. Duplicate events are atomically idempotent, conflicting versions return 409, and older/lower-lifecycle events cannot regress a call. A persistent per-agency new-event rate limiter and 16 KiB JSON body limit bound ingestion. Raw webhook bodies, nested `crm`/`activeCRM` objects, `webhookHeaders`, tokens, API keys, caller names, transcripts and recording URLs are discarded. Event logs store no contact payload.

### Source attribution and people

Configure vendor sources/tracking numbers with a verification reference. Unknown destinations remain unattributed. Demonstrate that the original called DID survives queues/transfers before mapping it to a vendor; this adapter uses `tonumber164`/`tonumber` and cannot recover a DID that the provider has replaced. A vendor's billable duration rule is independent of Kixie's answered status or reporting connection threshold. Charges are recorded separately from verified invoices or billing records, never inferred from duration or Kixie's undocumented `amount` currency.

Repeated caller numbers produce bounded owner-review candidates only. They never create or merge people, infer consent, change agency, or assign leads. The owner must explicitly link a verified identity with a reason. Assignment needs verified residence, intended product, carrier and a currently verified eligible agent. A caller's area code is not residence evidence. Kixie-agent mapping records who handled a call; it does not grant access to unassigned leads.

### Production and follow-up

Compensation schedules are per agency/agent/carrier/product/contract/date/issue-age band, with separately configurable commission and advance percentages. The requested whole-life illustration is 39% through age 60, 65% over 60 and 75% advance of commission: at age 61, $75 monthly premium means $900 annualized premium, $585 estimated commission and $438.75 estimated advance. These rates are not seeded as a verified carrier contract and are not applied to term/IUL without a matching verified schedule.

Financial facts require explicit source references. Annualized premium and estimates never become revenue. Earned, paid, advanced and chargeback facts remain separate; record paid cash net of any amount already classified as an advance to prevent double counting. Vendor costs and telephony costs are separate ledgers. 30/60/90-day retention is based on an explicit issued date and a verified observation; missing evidence remains unknown. Reports aggregate USD only and do not convert currencies.

Callbacks create internal held/suppressed preparations only. DNC, replies, wrong numbers, lack of contact-consent evidence and manual holds block outbound eligibility; even otherwise eligible tasks stay held because no sending transport exists. No call event establishes marketing/SMS or recording consent. Recording availability remains `available_unreviewed` or `not_provided`; URLs and media are not stored or played.

Read [the acquisition playbook](lead-acquisition-kixie-playbook.md), [API contract](api-contract.md) and [release gates](kixie-release.md). Legal/compliance review, account setup, live numbers, contracts, test-party consent and live activation require separate approval.

Financial-report boundary: displayed amounts are recorded verified USD ledger subtotals, not a completeness assertion. Missing receipt/statement data remains unknown. `cashRoi` is withheld until cash and cost statements are explicitly reconciled against a bounded ledger snapshot; this first release has no reconciliation-certification workflow. Phone duration, quote AP and projected compensation never substitute for revenue evidence.

Additional safeguards: tracking mappings become effective when explicitly configured; older calls remain unknown and a DID cannot be silently reassigned to a different source. First-call attribution is frozen. SQL independently enforces fixture-only numbers/emails and event age. The ingestion LOGIN must retain inherited membership in `agency_kixie` (on PostgreSQL 16+, use the appropriate per-grant INHERIT option); application sessions must not `SET ROLE`. Both original login and current role are checked. New UI identity links remain owner-only even when an admin can see an already-linked call.

The existing contact receipt table records the intake request's contact grant. It does not implement a full channel/purpose grant-and-revocation history. Current DNC/reply flags suppress preparations; any future outbound workflow requires explicit current consent and revocation/suppression evidence, not an old contact receipt alone.
