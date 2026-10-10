# Phase 3 review and release boundaries

## Baseline

Branch: `feat/phase3-agency-platform`, based on main commit `f668c34b4946f509de5022b7d4ea045a0625a635` (merged Phase 2). The existing editorial navy/ivory palette, Newsreader/Manrope fonts, V identity, responsive photography and product caveats are retained. This remains a lightweight static frontend with same-origin Node API routes, rather than an unrelated framework rewrite.

## What a preview does and does not prove

Without backend configuration, the site is a visual review and the API fails closed. An unconfigured preview is not a functioning lead system. Never show a successful submission or a populated private dashboard based on localStorage, browser-only roles, hardcoded credentials or invented records.

Local database tests execute the migration in real PostgreSQL through PGlite (PostgreSQL compiled to WebAssembly). CI also executes it against a conventional PostgreSQL service. Test-only auth tables/functions and fictional identities do not prove Google OAuth, Supabase configuration, deployed cookies, email delivery or hosted integration. Those require separate end-to-end verification.

## Isolated infrastructure prerequisite

Use a new isolated, nonproduction Supabase project and a Vercel preview-only environment. Before configuring ongoing access, obtain approval for the project, provider terms, OAuth grant and restricted database credentials. Credential entry belongs in the provider's secure configuration interface, never chat or committed files. No production data, keys or account settings should be copied into preview.

Authentication must be invite-only and membership-based. Google OAuth redirect destinations must be explicitly allowlisted. Database migrations need an administrative setup connection; public ingestion must use its own narrowly privileged database role. Authenticated lead operations must retain the user's database identity and RLS protection. A broad service-role connection is not an acceptable replacement for isolation.

Notifications remain disabled until the provider, verified sender, audience and approved minimal content are configured. Invites can be recorded without sending mail; the UI must disclose that delivery did not occur. Public collection remains disabled until privacy, consent, retention and security review are complete.

## Marketing claim gate

The requested “$37 for up to $1 million” claim is not approved for publication. An official Ethos calculator updated October 5, 2026 gives an illustrative $37–$63 monthly range for a $1 million, 10-year term, age-30 nonsmoking male in excellent health. A separate Ethos article updated August 23, 2026 describes a different health assumption. Do not combine the examples or treat editorial material as approval of agency advertising.

Candidate evidence: https://www.ethos.com/life/calculator/ and https://www.ethos.com/life/term-life-insurance-no-medical-exam/ . Approval rules: https://www.ethos.com/agents/legal/ . The exact copy, placement, profile, rate class, carrier/product, eligible states, effective/expiry dates and written marketing approval must be verified before a future change activates the claim. No pricing promise belongs in rendered HTML, metadata, schema or mobile variants meanwhile.

## Release gates

- Owner reviews the draft PR, functional preview and desktop/mobile screenshots.
- Real Supabase Auth login, invite membership, disabled-user rejection, session expiry, logout and CSRF are verified.
- Two agents and an owner exercise actual hosted persistence and direct API/database isolation with fictional leads.
- Concurrent submissions, duplicate retries, rate limiting, consent versions and assignment conflicts are tested.
- Agent identity, state licensing, carrier/product appointments, expiry and ownership conditions are verified before assignment. Missing evidence keeps assignment blocked.
- Agency contact email receipt is independently verified. The existing Google Calendar URL identifies one person's calendar, not a shared agency schedule.
- Privacy/consent/retention text and carrier marketing approval are reviewed; no live customer collection occurs during testing.
- Separate explicit authorization is required to merge or deploy production. This work does not change DNS, production environments or paid services.
