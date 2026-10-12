# Phase 3 API contract
Same-origin Node handler `api/index.mjs` routes `/api/*`. JSON no-store. Errors `{error:{code,message,fields?}}`. Missing config: 503 `NOT_CONFIGURED`; no fallback authentication/in-memory persistence.

## Public
GET `/api/config`: `{configured,mode:"disabled"|"fictional_preview"|"production",intakeEnabled,consent:{version,contactText,marketingText},products:[{value,label}]}`.
POST `/api/intake`: `{name,email,phone,state,product,intent:"quote"|"appointment",consent:{contact:true,marketing:boolean,version},utm?:{source,medium,campaign,term,content},sourcePath:"/"|"/veterans/",website?:"",fictional:true,challengeToken?:string}`. Header `Idempotency-Key`: UUID reused for identical retry. Preview accepts ONLY explicit fictional:true; no real information. Products: term_life, whole_life, final_expense, mortgage_protection, retirement, veteran_benefits, unsure. State two-letter US state/DC. Name and email or phone required. No sensitive notes. 201 `{accepted:true,receipt:"UUID",appointmentRequested:boolean}` only after database commit; retry 200 same receipt. Appointment is a request, not confirmed calendar booking. 400 validation, 403 origin/fictional/challenge, 409 idempotency conflict, 429 rate limit, 503 unavailable. Consent version `2026-10-10.v1`, exact copy provided by config.

## Authentication
GET `/api/auth/google`: Google PKCE login, 503 until configured.
GET `/api/auth/callback`: fixed destination `/admin/`; no arbitrary next/redirect.
GET `/api/admin/session`: `{authenticated:true,user:{id,email,role,agencyId},csrfToken,mode}` or 401/503. Roles owner/admin/agent. No public demo login. Invite-only.
POST `/api/auth/logout`: CSRF header clears session.

## Authenticated
Mutations require JSON, trusted Origin, `X-CSRF-Token` from session. Agency-scoped server and database; agents only assigned leads, owner/admin their agency, manager denied initially.
GET `/api/admin/leads?status=&product=&state=&search=&page=1`: `{leads:[{id,name,email,phone,state,product,intent,status,assigned_to,created_at,updated_at,utm,source_path}],page,pageSize:25,total}`.
GET `/api/admin/leads/:id`: `{lead,events:[],consents:[]}`.
PATCH `/api/admin/leads/:id`: `{status:"new"|"contacted"|"qualified"|"closed"|"archived"}` -> `{lead}`. No other fields.
GET `/api/admin/metrics`: `{total,new,contacted,qualified,closed,unassigned}` same visibility.
GET `/api/admin/users`: owner/admin `{users:[{user_id,email,role,status,verified,eligibility:[]}]}`.
POST `/api/admin/invites`: owner/admin `{email,role:"admin"|"agent"}` -> `{invitation:{id,email,role,status:"pending",expires_at},delivery:"not_sent"}`. Records only, no external email.
POST `/api/admin/leads/:id/assign`: owner/admin `{agentId,expectedAssignee:null|UUID,reason}` -> `{lead}` or 409 ownership/422 eligibility failure. Requires verified active identity and verified active unexpired state/product/carrier eligibility; missing facts fail closed.
GET `/api/admin/settings`: owner/admin `{agency:{id,name},mode,notifications:{enabled:false},retention:{status:"approval_required"}}`. Read-only.

Hosted OAuth, credentials, live notifications, real lead collection require approval. Real local PostgreSQL tests do not establish hosted Auth integration.

## Extended questionnaire and dashboard fields
Intake additionally accepts optional `ageRange` (18-39,40-59,60-70,71-85,86+), `budget` (25-50,50-100,100-200,200+ or null), `interest` (family,final_expense,mortgage_income,long_term,unsure), and `preferredContact` (phone,email,sms). `sourcePath` also permits `/find-coverage/`. Stored lead fields are `age_range`, `budget`, `interest`, `preferred_contact`. Name maximum161 characters.

Statuses also include `application` and `sold`; these must reflect actual user-recorded business events, not inferred conversion. PATCH additionally accepts `follow_up_at` (ISO timestamp or null) and `do_not_contact` (boolean). POST `/api/admin/leads/:id/notes` takes `{body}` plain text1–2000 and returns `{event}`. Event shape is `{event,detail,created_at,actor_id}`; note content is `detail.body`, update fields `detail`, assignment reason `detail.reason`.
Metrics also return application/sold/archived, followUpDue, appointmentRequested, and count maps bySource/byCampaign/byAgent. Metrics are recorded lead/workflow totals; no fabricated revenue/ROI or paid-channel claims.

Only an owner may invite another admin. No external invitation email is sent. Existing-carrier/eligibility unknowns fail closed: a newly submitted lead has no verified carrier and cannot be assigned until approved operational verification populates this fact. This version does not provide a UI for verifying licensing or carrier evidence.

## Logout outcome
POST `/api/auth/logout` clears local access, refresh, CSRF and PKCE cookies. It returns `{localSignedOut:true,remoteRevocationConfirmed:true,signedOut:true}` only when provider revocation succeeded (or no session existed). A provider outage returns `{localSignedOut:true,remoteRevocationConfirmed:false,warning}`; the UI must return to sign-in while preserving the warning that remote revocation could not be confirmed. It must not retain a refresh token for silent retry or claim full revocation.

Fictional notification deep links use `/admin/leads?lead=UUID`; the dashboard resolves them only after authentication through the same RLS-enforced lead detail endpoint.

## Kixie CRM extension

All responses are private/no-store. Admin routes reuse the invited Google session, authoritative membership checks, exact origin and CSRF rules. Agency IDs always come from the server session/configuration; database RLS and security-definer transactions remain authoritative. Owner/admin can manage agency production and source configuration; agents see assigned-lead calls and may add internal call updates. Only the owner sees unlinked calls, phone-match candidates and raw normalized event metadata or explicitly links call identities.

- `POST /api/integrations/kixie`: server-to-server route; documented JSON envelope, exact `X-Kixie-Webhook-Token`, expected business IDs and fictional-only gate. No session cookies or CSRF substitute for webhook verification. 202 accepted, 200 replay, 400 invalid, 401 incorrect credential, 403 business/nonfictional data rejected, 413 body over 16 KiB, 415 non-JSON, 422 unsupported event/direction or stale/future event, 409 conflicting replay, 429 event limit, 503 unconfigured/uncertain persistence. The response contains `accepted`, `replayed`, `applied`, never customer data. Only `startcall`, `answeredcall`, `endcall` are enabled.
- `GET /api/admin/integrations/kixie`: safe capabilities only. `accountConnectionVerified`, `liveCollectionEnabled`, `clickToCallEnabled`, `followUpSendingEnabled` and `recordingPlaybackEnabled` are false. No credentials or connection URIs are returned.
- `GET /api/admin/calls?page=1&status=answered&vendor=<uuid>`: 25-row bounded page, optional allowlisted status/vendor filters, authorized total. Display names are separately fetched under the same agency/RLS scope; missing names stay null.
- `GET /api/admin/calls/:uuid`: authorized call, up to 100 normalized events, 100 notes and 20 prepared callback tasks. Event metadata is owner-only; other authorized roles receive an empty event list.
- `PATCH /api/admin/calls/:uuid`: any nonempty subset of `disposition`, `note` (1–2,000 characters), `callback_at` (ISO timezone or null), `follow_up_hold` (boolean). Dispositions: connected, no_answer, voicemail, callback_requested, not_interested, do_not_contact, wrong_number, replied. No status implies a policy sale. Notes should avoid medical, financial-account or identity details.
- `POST /api/admin/calls/:uuid/link`: owner-only transaction, `{leadId, reason}`; minimum eight-character identity verification reason. Phone alone is insufficient. Existing links cannot be reassigned to a different person.
- `POST /api/admin/leads/:uuid/routing-verification`: owner/admin `{state, product, carrier, reference}`; verified residence and desired coverage, never area-code inference.
- `POST /api/admin/calls/:uuid/route`: owner/admin `{agentId, expectedAssignee, reason}`; current routing verification and state/product/carrier/license eligibility, optimistic assignment check.
- `POST /api/admin/vendors`: owner/admin `{key, name, phone?, reference?}`; source and optional verified tracking number configuration. This records an existing verified number; it does not buy, provision or forward one.
- `POST /api/admin/kixie-agent-mappings`: owner/admin `{userId, externalAgentId?, externalEmail?, reference}`; records verified existing identities, never creates membership or assigns a lead.
- `POST /api/admin/compensation-schedules`: owner/admin explicit `agent_id`, `carrier`, `product`, `contract_key`, effective dates, minimum/maximum issue age, `commission_bps`, `advance_bps`, `verification_reference`. No default carrier or term/IUL rate is inferred.
- `POST /api/admin/policies`: owner/admin verified `lead_id`, `agent_id`, `carrier`, `product`, `contract_key`, `external_reference`, `status`, `verification_reference`, optional `effective_date`, `issued_at`, `issue_age`. Stages distinguish qualified, quoted, application, submitted, issued, paid and active plus negative outcomes. Issued/paid/active need explicit issuance evidence/date; no call-based automatic transition.
- `POST /api/admin/costs`: owner/admin `{kind, targetId, sourceId?, amountCents, currency, reference}`; `vendor_lead` targets a lead and source; `telephony` targets a call with no source ID. These are ledger entries, not payments.
- `POST /api/admin/policies/:uuid/financial-facts`: owner/admin `{type, amountCents, currency, reference}`. Types: annualized_premium, commission_earned, commission_paid, commission_advanced, chargeback. Immutable evidence, no transfer/payment.
- `POST /api/admin/policies/:uuid/retention`: owner/admin `{dayMark, observedOn, active, reference}`; dayMark 30/60/90, verified observation after cohort maturity, no future observation.
- `GET /api/admin/production`: owner/admin policies, schedules, vendors, USD financial summary and mature-cohort retention with unknown evidence counts. This is bounded to fewer than 10,000 rows per ledger; larger reports fail explicitly instead of truncating totals.
- `POST /api/admin/commission-estimate`: owner/admin `{scheduleId, monthlyPremiumCents, age, product, carrier, agentId, contract, effectiveOn}`. Exact matching verified schedule only. Returns estimate-only AP/commission/advance in cents; recognized revenue remains zero. It does not record a sale or cash receipt.

No external Kixie call/SMS request, email delivery, recording retrieval, number-management or paid purchase endpoint exists in this release. See [backend setup](backend-setup.md) for secure binding, allowed fixtures and provider timestamp caveats.

Financial-report boundary: displayed amounts are recorded verified USD ledger subtotals, not a completeness assertion. Missing receipt/statement data remains unknown. `cashRoi` is withheld until cash and cost statements are explicitly reconciled against a bounded ledger snapshot; this first release has no reconciliation-certification workflow. Phone duration, quote AP and projected compensation never substitute for revenue evidence.
