# Benefits with Veterans: Phase 3

A premium agency website, five-step coverage-request experience and invite-only lead workspace. Static pages retain the merged Phase 2 design. Same-origin Vercel Node endpoints connect to Supabase Auth and persisted PostgreSQL with database-enforced agency and assignment isolation.

## Review-only release

This is a feature-branch implementation, not authorization to merge or deploy production. No DNS, production configuration, paid infrastructure or real customer collection is changed. Missing backend configuration fails closed: no browser-storage database, demo password, fake login or fabricated successful submissions.

- Public routes: `/`, `/veterans/`, `/find-coverage/`
- Private workspace: `/admin/leads/`
- Agency contact: `info@benefitswithveterans.com` (mailbox delivery requires separate verification)
- Exact Ethos partner destination: https://app.ethoslife.com/partner/780a6/q/goals
- Anvar's individual calendar, never an agency-wide schedule: https://calendar.app.google/PF12N8i49QaFAV7o9

Producer identity and NPN remain in compliance disclosures. Agency marketing replaces the personal portrait/introduction. The unapproved $37/$1 million claim remains unpublished. Product, state, eligibility and VA-independence caveats remain visible.

## Local development

Node 22 or later:

```sh
npm ci
npm run check
npm run dev
```

The local review server listens only on `127.0.0.1:8080`. Without isolated credentials, public intake and private sign-in remain unavailable. Do not put credentials in source, chat, screenshots or `.env.example`.

```sh
npm run test:db        # actual PostgreSQL via PGlite, fictional data
npm run test:e2e       # Playwright; install Chromium first
npm run build
```

To exercise conventional PostgreSQL, set `TEST_DATABASE_URL` to a fresh disposable local test database and run `npm run test:db`. The harness creates roles and a synthetic `auth` schema and is not for an existing Supabase or production database. GitHub Actions supplies a fresh PostgreSQL service and runs both database paths. Browser transport stubs verify questionnaire state and error handling only; they do not establish hosted persistence or OAuth integration.

## Security model

- Only invited, verified Google identities can receive active memberships. Matching an email domain does not grant access.
- Owner/admin visibility is agency-scoped; agents see only assigned leads. Manager permissions default to denied.
- RLS protects leads and related consent/timeline data. Runtime users cannot directly update ownership or memberships.
- Public intake uses a separately restricted PostgreSQL role and atomic RPC with idempotency, persistent rate limits, consent receipt and minimal outbox event.
- Status and assignment changes use authorization-checked database transactions. Missing carrier/state/product/license verification blocks assignment.
- Secure server-side cookies, PKCE, trusted-origin checks and CSRF protect private mutation endpoints. No private lead payload belongs in client storage, URLs, analytics or notification bodies.
- Hosted staging is fictional-only. Live notifications and customer collection remain disabled; invitations recorded without sending mail must be completed through approved provisioning.

Read [the API contract](docs/api-contract.md), [release boundaries and gates](docs/phase3-release.md), and the database migration/setup guidance before configuring an isolated preview. Review defaults and provider policies; code tests cannot certify legal compliance.

## Design and assets

Self-hosted Newsreader and Manrope fonts (SIL Open Font License), navy/ivory/gold/crimson design tokens, original V marks and responsive family photography retain the Phase 2 identity. The family photo is illustrative, not a customer or veteran endorsement: RDNE Stock project / Pexels photo 6149192, https://www.pexels.com/photo/family-of-different-ages-hugging-6149192/ . Legacy teaching-math tests remain as reference; that module is not a live quote engine.
