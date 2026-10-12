# Kixie CRM review release

This feature branch extends the merged Phase 3 agency platform. It is review-only: no production deployment, merge, live migrations, paid number, vendor order, credential configuration or customer collection is authorized by a draft PR. The separate private CRM has not been imported or copied.

## Implemented scope

- Authenticated call history and internal dispositions, notes, callback preparations and held follow-up status
- Documented incoming `startcall`, `answeredcall`, `endcall` envelope adapter with a supported shared-secret header, strict business binding and fictional-only runtime restrictions
- Atomic persistent deduplication, lifecycle ordering, rate limiting, restricted DB LOGIN/agency binding, row security and bounded normalized metadata
- Owner-reviewed identity links, phone-match candidates without automatic merging, and verified geographic/product/carrier routing
- Independent vendor lead/telephony costs, policy production states, contract/age compensation schedules, estimate-only commission/advance calculations, verified actual ledger facts and 30/60/90-day retention evidence
- Source-linked acquisition/Kixie operating playbook and provider caveats

## Deliberate release limits

The feature tests are not proof of live Kixie connectivity. A separate read-only account audit on 2026-10-12, 01:18–01:21 UTC verified the displayed Professional Phone subscription and one active agent-assigned local number. It did not verify an audio path, recording-consent workflow, webhook setup/header delivery or successful live lead transfer. Missing backend configuration remains unavailable. Browser fixtures verify the UI, not hosted OAuth/persistence. Database tests verify a disposable database, not production migration readiness.

Internal dispositions are implemented; Kixie disposition/voicemail/SMS/scheduled-activity/AI-summary ingestion is not enabled. Provider documentation lists those features, but each needs a verified account-specific envelope and correlation/time contract before adding an adapter. Raw recording URLs/transcripts are excluded. Click-to-call and all external follow-up transports remain unavailable. The whole-life rate illustration does not certify carrier compensation or establish rates for term/IUL.

The receiver hard-rejects non-fictional caller/destination numbers and agent emails. Live activation requires a separately reviewed code change, secure setup and explicit approval, not merely toggling an environment variable.

## Account audit checkpoint

The [operating playbook](lead-acquisition-kixie-playbook.md#verified-account-audit-2026-10-12) is the source of truth for the observations and authenticated account-page evidence locations. No settings were changed, calls placed, purchases made or recordings opened during the audit. Account identifiers and the assigned number are omitted for privacy.

- Verified displayed billing: Professional Phone, three-month cycle, current period through 2026-11-28, one Local Number. The agent displays Professional Per Minute and Power Dialer None.
- Unresolved account verification: a trial/inbound-SMS representative-verification banner remains despite that billing display. Working inbound service cannot be inferred from either display.
- Inbound device is Not set, Ring Devices is OFF, Forward is OFF with no forwarding devices, and there are zero business routing rules. Registered PowerCall WebRTC/mobile devices do not verify the intended PC's Chrome extension or headset.
- Allow Webhooks is ON; External API keys are disabled. No configured receiver or delivery was verified. API-key activation is not established as a requirement for outgoing custom-header webhook delivery; verify the supported configuration path before requesting any credential change.
- Existing account/agent recording controls are ON, outbound recording is All, and Send Recordings to CRM is ON while CRM is None. Consent, retention and a working destination remain unverified; no recording was opened.
- Live work is blocked on representative-verification resolution, approved inbound device/ringing setup, hosted backend/authentication and secure secret provisioning, plus the separate code/review approval needed to accept live data.

## Approval and verification gates before live work

1. Review and approve the data model, role boundaries, marketing/compliance language and privacy/retention decisions.
2. Approve an isolated staging project and securely provision the restricted LOGIN, tenant binding, auth invitations and header secret. Never paste credentials into a PR or chat.
3. Use the audited Professional subscription/assigned-number state as the baseline; confirm account authority and resolve the persistent representative-verification banner with Kixie. Verify the intended PC's Chrome PowerCall/headset and approve inbound device/ringing/no-answer configuration. Confirm the webhook configuration method independently of External API keys, then verify actual incoming payloads, legacy timestamp timezone and custom-header delivery. Ask for retry/delivery behavior instead of inventing it.
4. Review any number/account/order agreement and its full spending/renewal/cancellation terms before purchase. A tracking mapping does not authorize a purchase.
5. Demonstrate original destination DID attribution, caller identity, queue/transfer behavior, agent availability and audio device behavior using approved test participants and a number explicitly approved for testing. The existing assigned number does not authorize a test call or a new number purchase.
6. Verify state/carrier/product/license eligibility and manual fallback routing. Caller area code cannot substitute for residence.
7. Approve recording/transcription and outreach consent language, opt-out/reply/hold rules, retention and delivery configuration. Test DNC before any external transport exists.
8. Reconcile a test vendor invoice separately from telephony charges, then human-verified issuance, paid/advance/earned/chargeback and retention evidence. Do not optimize against quoted AP or unverified projected commission.
9. Review screenshots, migrations, application/database/browser tests and exact-commit CI. Merge and production deployment remain separate approvals.

## Validation record

Run `npm run build`, `npm run test:db` and `npm run test:e2e`. CI additionally exercises conventional disposable PostgreSQL. Test counts and the final commit are recorded in the draft PR after integration; do not treat this checklist as a claim that hosted services were connected.

Financial-report boundary: displayed amounts are recorded verified USD ledger subtotals, not a completeness assertion. Missing receipt/statement data remains unknown. `cashRoi` is withheld until cash and cost statements are explicitly reconciled against a bounded ledger snapshot; this first release has no reconciliation-certification workflow. Phone duration, quote AP and projected compensation never substitute for revenue evidence.
