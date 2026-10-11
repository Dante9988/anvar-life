import { createHash } from 'node:crypto';
import pg from 'pg';
import { HttpError } from './config.mjs';
import { equal } from './http.mjs';


// Kixie documents custom HTTP headers, not a vendor-generated signature.
// Sources and field caveats are recorded in the acquisition playbook.
export const KIXIE_EVENTS = Object.freeze(['startcall', 'answeredcall', 'endcall']);
export const KIXIE_ROLE_CHECK_SQL = `select bool_or(r.rolsuper) as rolsuper,
  bool_or(r.rolbypassrls) as rolbypassrls,
  bool_or(exists(select 1 from pg_class t join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public' and t.relkind in ('r','p','v','m','f') and
    (t.relowner=r.oid or has_table_privilege(r.oid,t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')))) as can_access_tables,
  session_user<>current_user as switched_role
  from pg_roles r where r.rolname in (current_user,session_user)`;
const pools = new Map();
const fail = (code, message, status = 400) => { throw new HttpError(status, code, message); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const tokenPattern = /^[A-Za-z0-9_-]{32,128}$/;
export function kixieConfig(env = process.env, app = {}) {
  const secret = env.KIXIE_WEBHOOK_SECRET || '';
  const enabled = app.configured === true && app.mode === 'fictional_preview' &&
    env.KIXIE_PREVIEW_ENABLED === 'true' && env.KIXIE_FIXTURE_ONLY === 'true' &&
    tokenPattern.test(secret) && /^\d{1,20}$/.test(env.KIXIE_BUSINESS_ID || '') &&
    Boolean(env.KIXIE_DATABASE_URL) && Boolean(app.agencyId);
  return { enabled, secret, businessId: env.KIXIE_BUSINESS_ID, databaseUrl: env.KIXIE_DATABASE_URL,
    agencyId: app.agencyId, legacyUtc: env.KIXIE_LEGACY_TIMESTAMPS_UTC === 'confirmed',
    fixtureOnly: true };
}
export function kixieCapabilities(c) {
  return { provider: 'kixie', mode: 'fictional_preview', ingestionEnabled: c.enabled,
    supportedEvents: KIXIE_EVENTS, verification: 'shared_secret_header',
    accountConnectionVerified: false, liveCollectionEnabled: false,
    clickToCallEnabled: false, followUpSendingEnabled: false,
    recordingPlaybackEnabled: false, setupRequired: !c.enabled };
}
export function verifyKixieRequest(req, c) {
  if (!c.enabled) fail('KIXIE_NOT_CONFIGURED', 'Kixie fictional-preview ingestion is not configured.', 503);
  // Header values in a URL, query string, payload or cookies are never credentials.
  const presented = req.headers['x-kixie-webhook-token'];
  if (!tokenPattern.test(typeof presented === 'string' ? presented : '') || !equal(presented, c.secret))
    fail('KIXIE_UNAUTHORIZED', 'Webhook verification failed.', 401);
}
function text(value, max, required = false) {
  if (value === undefined || value === null || value === '') {
    if (required) fail('KIXIE_PAYLOAD', 'A required event field is missing.');
    return null;
  }
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u001f]/.test(value))
    fail('KIXIE_PAYLOAD', 'An event field is invalid.');
  return value;
}
function timestamp(value, c, required = false) {
  if (required && (value === undefined || value === null || value === "")) fail("KIXIE_TIMESTAMP", "The event timestamp is missing.");
  let raw = text(value, 40, required);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw) && c.legacyUtc)
    raw = raw.replace(' ', 'T') + 'Z';
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(raw) || !Number.isFinite(Date.parse(raw)))
    fail('KIXIE_TIMESTAMP', 'Event timestamps need a verified timezone.');
  const [year,month,day]=raw.slice(0,10).split('-').map(Number);
  const calendar=new Date(Date.UTC(year,month-1,day));
  if(calendar.getUTCFullYear()!==year||calendar.getUTCMonth()!==month-1||calendar.getUTCDate()!==day)
    fail('KIXIE_TIMESTAMP', 'The event date is invalid.');
  return new Date(raw).toISOString();
}
function number(value) {
  if (value === undefined || value === null || value === '') return null;
  const result = text(value, 20, true);
  if (!/^\+[1-9]\d{7,14}$/.test(result)) fail('KIXIE_PHONE', 'Phone numbers must use E.164 format.');
  return result;
}
export function normalizeKixie(input, c, now = Date.now()) {
  if (!object(input) || !object(input.data) || !object(input.data.callDetails))
    fail('KIXIE_PAYLOAD', 'Expected the documented Kixie data.callDetails envelope.');
  const d = input.data, call = d.callDetails;
  if (String(d.businessid) !== c.businessId || String(call.businessid) !== c.businessId)
    fail('KIXIE_BUSINESS_MISMATCH', 'Webhook business verification failed.', 403);
  const eventType = text(d.hookevent, 30, true);
  if (!KIXIE_EVENTS.includes(eventType)) fail('KIXIE_EVENT_UNSUPPORTED', 'This event type is not enabled.', 422);
  // This integration is inbound-only. Neither outgoing automation nor sales are inferred.
  if (call.calltype !== 'incoming') fail('KIXIE_DIRECTION_UNSUPPORTED', 'Only incoming calls are enabled.', 422);
  const callId = text(call.callid, 128, true);
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(callId)) fail('KIXIE_PAYLOAD', 'Invalid call identifier.');
  const startedAt = timestamp(call.calldate, c, true);
  const answeredAt = timestamp(call.answerDate, c);
  const endedAt = timestamp(call.callEndDate, c, eventType === 'endcall');
  const occurredAt = eventType === 'startcall' ? startedAt : eventType === 'answeredcall' ? answeredAt : endedAt;
  if (!occurredAt) fail('KIXIE_TIMESTAMP', 'The event timestamp is missing.');
  const time = Date.parse(occurredAt);
  if (time > now + 300000 || time < now - 7 * 86400000)
    fail('KIXIE_EVENT_AGE', 'The event is outside the seven-day acceptance window.', 422);
  if ((answeredAt && Date.parse(answeredAt) < Date.parse(startedAt)) ||
      (endedAt && (Date.parse(endedAt) < Date.parse(startedAt) || (answeredAt && Date.parse(endedAt) < Date.parse(answeredAt)))))
    fail('KIXIE_TIMESTAMP', 'Call times are inconsistent.');
  const fromNumber = number(call.fromnumber164 || call.fromnumber);
  const toNumber = number(call.tonumber164 || call.tonumber);
  // This branch cannot collect real caller data even if environment switches are set.
  if (!fromNumber || !toNumber || ![fromNumber, toNumber].every(n => /^\+1[2-9]\d{2}55501\d{2}$/.test(n)))
    fail('KIXIE_FICTIONAL_ONLY', 'Only reserved fictional phone numbers are accepted in this release.', 403);
  let durationSeconds = null;
  if (eventType === 'endcall' && call.duration !== '' && call.duration != null) {
    const n = typeof call.duration === 'number' ? call.duration : /^\d{1,6}$/.test(call.duration) ? Number(call.duration) : NaN;
    if (!Number.isInteger(n) || n < 0 || n > 86400) fail('KIXIE_PAYLOAD', 'Call duration is invalid.');
    durationSeconds = n;
  }
  const status = eventType === 'startcall' ? 'ringing' : eventType === 'answeredcall' ? 'answered' :
    ['answered', 'missed'].includes(call.callstatus) ? call.callstatus : 'unknown';
  const email = text(call.email, 254);
  if (email && !/^[^\s@]+@example\.(invalid|test)$/.test(email))
    fail('KIXIE_FICTIONAL_ONLY', 'Only fictional agent identities are accepted in this release.', 403);
  const normalized = { callId, eventType, occurredAt, startedAt, endedAt,
    direction: 'inbound', status, fromNumber, toNumber, trackingNumber: toNumber,
    durationSeconds, externalAgentEmail: email?.toLowerCase() || null,
    recordingStatus: eventType === 'endcall' && typeof call.recordingurl === 'string' && call.recordingurl.length > 0 ? 'available_unreviewed' : 'not_provided',
    consentStatus: 'unknown' };
  // No raw body, CRM tokens, API keys, transcript, note or recording URL is retained.
  const eventId = digest([c.businessId, callId, eventType, occurredAt]);
  return { ...normalized, eventId, eventHash: digest(normalized) };
}
function database(c) {
  if (!pools.has(c.databaseUrl)) pools.set(c.databaseUrl, new pg.Pool({
    connectionString: c.databaseUrl, max: 2, idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000, statement_timeout: 8000, query_timeout: 10000,
    ssl: ['localhost', '127.0.0.1', '[::1]'].includes(new URL(c.databaseUrl).hostname) ? false : { rejectUnauthorized: true },
  }));
  return pools.get(c.databaseUrl);
}
export async function receiveKixie(req, c, input, deps = {}) {
  verifyKixieRequest(req, c);
  const event = normalizeKixie(input, c, deps.now ?? Date.now());
  try {
    const db = deps.database || database(c);
    const runtime = (await db.query(KIXIE_ROLE_CHECK_SQL)).rows[0];
    if (!runtime || runtime.rolsuper || runtime.rolbypassrls || runtime.can_access_tables || runtime.switched_role) throw new Error('Unsafe integration role');
    return (await db.query('select public.ingest_kixie_event($1,$2::jsonb) as result', [c.agencyId, JSON.stringify(event)])).rows[0].result;
  } catch (e) {
    if (e.code === '23505') fail('KIXIE_EVENT_CONFLICT', 'The event identifier already exists with different data.', 409);
    if (e.code === '54000') fail('KIXIE_RATE_LIMITED', 'Webhook request limit reached.', 429);
    // Never log vendor payload, credentials, phone numbers or database exceptions.
    fail('KIXIE_UNAVAILABLE', 'The event has not been confirmed. Retry with the same event.', 503);
  }
}
