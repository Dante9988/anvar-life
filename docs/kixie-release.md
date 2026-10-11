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

This is not proof of a connected Kixie account, plan entitlement, live DID, audio path, recording-consent workflow, webhook header delivery or successful live lead transfer. Missing backend configuration remains unavailable. Browser fixtures verify the UI, not hosted OAuth/persistence. Database tests verify a disposable database, not production migration readiness.

Internal dispositions are implemented; Kixie disposition/voicemail/SMS/scheduled-activity/AI-summary ingestion is not enabled. Provider documentation lists those features, but each needs a verified account-specific envelope and correlation/time contract before adding an adapter. Raw recording URLs/transcripts are excluded. Click-to-call and all external follow-up transports remain unavailable. The whole-life rate illustration does not certify carrier compensation or establish rates for term/IUL.

The receiver hard-rejects non-fictional caller/destination numbers and agent emails. Live activation requires a separately reviewed code change, secure setup and explicit approval, not merely toggling an environment variable.

## Approval and verification gates before live work

1. Review and approve the data model, role boundaries, marketing/compliance language and privacy/retention decisions.
2. Approve an isolated staging project and securely provision the restricted LOGIN, tenant binding, auth invitations and header secret. Never paste credentials into a PR or chat.
3. Verify the exact Kixie account plan, account owner, developer/webhook permissions, actual incoming payloads and legacy timestamp timezone. Confirm custom headers survive delivery. Ask for retry/delivery behavior instead of inventing it.
4. Review any number/account/order agreement and its full spending/renewal/cancellation terms before purchase. A tracking mapping does not authorize a purchase.
5. Demonstrate original destination DID attribution, caller identity, queue/transfer behavior, agent availability and audio device behavior using approved test participants and a separately approved number.
6. Verify state/carrier/product/license eligibility and manual fallback routing. Caller area code cannot substitute for residence.
7. Approve recording/transcription and outreach consent language, opt-out/reply/hold rules, retention and delivery configuration. Test DNC before any external transport exists.
8. Reconcile a test vendor invoice separately from telephony charges, then human-verified issuance, paid/advance/earned/chargeback and retention evidence. Do not optimize against quoted AP or unverified projected commission.
9. Review screenshots, migrations, application/database/browser tests and exact-commit CI. Merge and production deployment remain separate approvals.

## Validation record

Run `npm run build`, `npm run test:db` and `npm run test:e2e`. CI additionally exercises conventional disposable PostgreSQL. Test counts and the final commit are recorded in the draft PR after integration; do not treat this checklist as a claim that hosted services were connected.

Financial-report boundary: displayed amounts are recorded verified USD ledger subtotals, not a completeness assertion. Missing receipt/statement data remains unknown. `cashRoi` is withheld until cash and cost statements are explicitly reconciled against a bounded ledger snapshot; this first release has no reconciliation-certification workflow. Phone duration, quote AP and projected compensation never substitute for revenue evidence.
