# Single-agent conversion review

Status: review-only draft. Not approved to publish, merge, deploy, collect leads, send notifications, run campaigns or contact anyone. Based on `main` at `12ca281d401ea5ed8ff8136fbf756c2c302d58a9`. The existing draft Kixie PR #4 remains untouched. No multi-agent or lead-resale features are added.

## Review locally

Run `npm ci`, `npm run build`, and `npm run dev`, then open `http://127.0.0.1:8080/review/`.

The three distinct page drafts are:
- `/review/final-expense/`: smaller-policy purpose, initial benefit limitations and policy questions.
- `/review/term-life/`: defined term, family needs, renewal and conversion questions.
- `/review/living-benefits/`: conditional accelerated benefits, effect on beneficiaries, rider limits, costs and tax/public-assistance cautions.

Each uses the existing self-hosted fonts and visual identity. The named agent, Anvar Baltakhojayev, and the already-published NPN are clear. NPN display does not establish current state licensing or appointments. Private-business/non-VA disclosure appears before the headline. No price, benefit amount, carrier, licensing state, special veteran entitlement or approval is invented.

The individual Google Calendar destination is retained exactly: https://calendar.app.google/PF12N8i49QaFAV7o9 . Read-only browser inspection on October 22, 2026 confirmed Anvar's 30-minute Google Meet booking page; no appointment was made. The draft does not promise an appointment until that service confirms it. A direct-call affordance is explicitly unavailable until a number and inbound handling are verified; no fictitious `tel:` target is supplied. No campaign or form data are appended to the external calendar link.

## Prototype, not live intake

The callback design has four fields: name, phone, state and product topic. Callback permission is separate from a mandatory fictional-data acknowledgement. No automated-marketing option is offered. No real consent receipt is created.

The form accepts only reserved fictional 202-555-0100 through 202-555-0199 phone numbers. Its controls are disabled until its local handler loads. It has no submission endpoint, network transport, browser storage, analytics, pixels, notification provider or backend credentials. A successful local validation explicitly says nothing was sent or saved and clears the fields. Reset, reload, leaving and back/forward restoration clear unsent fields. State selection does not establish product availability or a license.

Live homepage, veterans page, existing questionnaire, sitemap, API, database, consent constants and notification code are unchanged. The drafts are not linked from the public pages and are permanently marked `noindex,nofollow,noarchive` within this branch. These are review cues, not access controls.

## Deployment protections

This branch is `review/single-agent-conversion`.

1. `vercel.json` sets `git.deploymentEnabled["review/single-agent-conversion"]` to `false`. No other branch setting is changed. Vercel's official Git configuration documentation specifies that matched branches do not trigger deployment on commits and unspecified branches remain enabled: https://vercel.com/docs/project-configuration/git-configuration .
2. `scripts/prepare-deployment.mjs`, the first step in the repository's Vercel build command, fails immediately when `VERCEL=1`. This prevents a manual Vercel build from publishing these unapproved drafts if the Git-specific guard is bypassed. The guard must not be removed until publication is explicitly approved.
3. The first remote branch reference must point directly to the complete guarded commit. Do not first push an unguarded base commit. Do not merge this branch or manually upload `dist` to any host.

These controls do not change production settings, DNS, other branches, preview authentication or account permissions. If the branch is renamed, the exact Git guard must be reviewed. The Vercel build guard still blocks deployments of this code. Other hosting systems are not authorized.

## Integration plan after approval, not implemented

Preserve the existing same-origin Vercel Node API, Supabase/PostgreSQL persistence, idempotency key, atomic request transaction, consent receipt, outbox and fail-closed authorization. Do not create a second database or bypass verified state/product/carrier eligibility checks.

Before connecting the new form:
1. Approve final copy, product/rider descriptions, legal business identity, relevant carrier advertising requirements and the exact licensed/appointed state/product scope. Verify the proposed phone number and inbound call handling.
2. Approve and version callback-only consent, privacy, retention, DNC/withdrawal handling and any separate future marketing consent. The draft text is not a legal compliance determination.
3. Define the accepted callback contract. Existing intake supports phone without email and optional age/budget, but it currently has different consent text, product enums and source-path allowlists. Do not silently send the new living-benefits value into an unsupported product enum. Decide whether to extend a validated `term_life` sub-interest or a verified product dimension, with matching database checks and tests.
4. Use an allowlisted fixed landing route for source, the selected state/product and the existing bounded five-field UTM normalizer. Revalidate on the server. No raw URLs, arbitrary query parameters, referrers, phone numbers or emails in campaign labels, analytics, logs or external-link parameters. This prototype does not collect UTMs at all.
5. Keep one responsible agent during this pilot. An appointment request is not a confirmed booking; an answered call is not necessarily a human conversation; a dashboard “sold” status is not proof of carrier issuance or placed coverage.
6. Verify the actual hosted persistence and consent receipt with approved synthetic data, safe duplicate retry, outage handling, withdrawal suppression and reload from the authenticated workspace. Do not claim a save on frontend validation. Keep live notifications and live collection disabled until separately approved and tested.

Suggested minimal future measurement, after approval: fixed source/product/state, accepted request, confirmed booking, held conversation, application submitted, carrier issued and placed/in-force. Attribution is not permission to contact. No ROI claim follows from requests or appointments alone.

## Content evidence and review limits

- [NAIC life insurance consumer guide](https://content.naic.org/consumer/life-insurance.htm): term coverage, cash-value distinction, renewal/conversion and contract-specific rider questions.
- [Alabama DOI accelerated benefits questions](https://aldoi.gov/consumers/BenefitsQandA.aspx): qualifying conditions, reduced remaining death benefit, possible fees/discounts and tax/public-assistance considerations.
- [Alabama DOI accelerated benefits overview](https://aldoi.gov/consumers/AcceleratedBenefits.aspx): not a substitute for health or long-term care insurance.
- [California DOI notice on sales to veterans](https://www.insurance.ca.gov/0200-industry/0120-notices/upload/NOTICE-SALES-LIFE-INS-ANNUITIES-VETERANS.pdf): important review context for avoiding misleading government affiliation.
- Existing repository final-expense explanations provide the baseline for initial-benefit caveats. The actual carrier contract and state-specific advertising approval remain required; no carrier product eligibility was established by this change.

No medical, tax or legal advice is personalized here. Content review and tests cannot certify regulatory compliance.

## Verification record

- `npm ci --cache /tmp/anvar-life-npm-cache --no-audit --no-fund`: passed. Initial default npm cache failed because the runner's home cache was not writable; using a temporary cache fixed installation without changing dependencies.
- `npm run build`: passed, including static integrity and 51 application checks.
- PGlite database suite: 11 passed, 1 conventional-connection concurrency check skipped. Conventional PostgreSQL remains a CI verification item.
- Deployment guard unit tests: exact branch exclusion and `VERCEL=1` hard failure both passed.
- Local Playwright run: blocked before any test page executed because Chromium could not create its required socket in the runner sandbox. A supported escalation attempt failed during environment setup. This was not an application assertion failure, and no local browser pass is claimed.
- Existing CI will run 52 desktop/mobile browser checks, including 14 new review checks, and the conventional PostgreSQL suite. Screenshots are generated by the tests as the `browser-review` artifact. CI status must be checked for the exact final commit before calling it validated.
- No hosted intake, real calls, bookings, production persistence, notification delivery or advertising campaign was tested or activated.
