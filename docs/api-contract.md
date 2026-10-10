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
