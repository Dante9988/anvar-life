import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { receiveKixie } from "../server/kixie.mjs";

// Optional real-PostgreSQL runs use a separate disposable database from the
// original suite. Never point either migration harness at an existing database.
const ids = Object.fromEntries([
  "agency", "otherAgency", "owner", "admin", "a", "b", "disabled", "manager",
  "otherOwner", "leadA", "leadB", "leadNoConsent", "leadOther", "leadUnassigned",
].map((key) => [key, randomUUID()]));
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
let eventSequence = 0;
const eventBase = Date.now() - 3_600_000;
const timeAt = (minutes) => new Date(eventBase + minutes * 60_000).toISOString();
const event = (patch = {}) => {
  const result = {
    eventId: `fixture-event-${++eventSequence}`,
    callId: "fictional-call-one",
    eventType: "endcall",
    occurredAt: timeAt(1),
    startedAt: timeAt(0),
    endedAt: timeAt(1),
    direction: "inbound",
    status: "answered",
    fromNumber: "+14155550101",
    toNumber: "+12125550102",
    trackingNumber: "+12125550102",
    externalAgentEmail: "a@example.invalid",
    durationSeconds: 60,
    recordingStatus: "available_unreviewed",
    consentStatus: "unknown",
    ...patch,
  };
  return { ...result, eventHash: hash(result) };
};

test("Kixie migrations: restricted ingress, identity review, current ownership and verified economics", async (t) => {
  const external = Boolean(process.env.TEST_DATABASE_URL || process.env.TEST_KIXIE_DATABASE_URL);
  let adminDatabase, testDatabase, databaseUrl;
  if (external) {
    const source = new URL(process.env.TEST_KIXIE_DATABASE_URL || process.env.TEST_DATABASE_URL);
    assert(["localhost", "127.0.0.1", "[::1]"].includes(source.hostname), "Kixie migration tests require a disposable local PostgreSQL server");
    adminDatabase = new pg.Client({ connectionString: source.toString() });
    await adminDatabase.connect();
    testDatabase = `kixie_test_${randomUUID().replaceAll("-", "")}`;
    await adminDatabase.query(`CREATE DATABASE ${testDatabase}`);
    source.pathname = `/${testDatabase}`;
    databaseUrl = source.toString();
  }
  const db = external ? new pg.Client({ connectionString: databaseUrl }) : new PGlite();
  if (external) await db.connect();
  const originalLogin = (await db.query("SELECT session_user AS login")).rows[0].login;
  const restoreSession = `SET SESSION AUTHORIZATION "${originalLogin.replaceAll('"', '""')}"`;
  const query = (sql, params = []) => db.query(sql, params);
  const exec = (sql) => external ? db.query(sql) : db.exec(sql);
  const user = async (id, fn, role = "authenticated") => {
    await query(`SET ROLE ${role}`);
    await query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id || ""]);
    try { return await fn(); }
    finally {
      await query("RESET ROLE");
      await query("SELECT set_config('request.jwt.claim.sub','',false)");
    }
  };
  const ingress = async (fn, login = "kixie_test_login_a") => {
    await query(`SET SESSION AUTHORIZATION ${login}`);
    try { return await user(null, fn, "agency_kixie"); }
    finally { await query(restoreSession); }
  };
  const ingest = async (data, agency = ids.agency, login) =>
    (await ingress(() => query("SELECT public.ingest_kixie_event($1,$2) AS result", [agency, data]), login)).rows[0].result;
  const rpc = async (id, name, params) =>
    (await user(id, () => query(`SELECT to_jsonb(public.${name}(${params.map((_, i) => `$${i + 1}`).join(",")})) AS result`, params))).rows[0].result;
  const rows = async (id, table) => (await user(id, () => query(`SELECT * FROM public.${table}`))).rows;
  const one = async (table, id) => (await query(`SELECT * FROM public.${table} WHERE id=$1`, [id])).rows[0];
  const forbidden = (fn) => assert.rejects(fn, /permission denied|NOT_FOUND|FORBIDDEN|UNSAFE_INTEGRATION_ROLE/i);
  let initialEvent, callId, unlinkedCallId, sourceId;
  try {
    await exec(`DO $$ DECLARE r text; BEGIN FOREACH r IN ARRAY ARRAY['anon','authenticated','supabase_auth_admin','kixie_test_login_a','kixie_test_login_b'] LOOP
      IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname=r) THEN EXECUTE format('CREATE ROLE %I NOLOGIN NOINHERIT',r); END IF; END LOOP; END $$;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text NOT NULL,email_confirmed_at timestamptz,raw_app_meta_data jsonb NOT NULL DEFAULT '{}');
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,supabase_auth_admin; GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;`);
    for (const name of ["001_agency.sql", "002_notification_preview.sql", "003_kixie_crm.sql"]) {
      await exec(await readFile(new URL(`../database/${name}`, import.meta.url), "utf8"));
    }
    await exec("GRANT agency_kixie TO kixie_test_login_a,kixie_test_login_b");
    await query("INSERT INTO public.agencies(id,name) VALUES($1,'Fictional Agency'),($2,'Other Fictional Agency')", [ids.agency, ids.otherAgency]);
    await query("INSERT INTO public.kixie_ingestion_accounts(runtime_role,agency_id) VALUES('kixie_test_login_a',$1),('kixie_test_login_b',$2)", [ids.agency, ids.otherAgency]);
    for (const key of ["owner", "admin", "a", "b", "disabled", "manager", "otherOwner"]) {
      await query("INSERT INTO auth.users VALUES($1,$2,now(),'{\"provider\":\"google\"}')", [ids[key], `${key}@example.invalid`]);
      const role = key === "owner" || key === "otherOwner" ? "owner" : ["admin", "manager"].includes(key) ? key : "agent";
      await query("INSERT INTO public.memberships(agency_id,user_id,email,role,status,verified) VALUES($1,$2,$3,$4,$5,true)", [key === "otherOwner" ? ids.otherAgency : ids.agency, ids[key], `${key}@example.invalid`, role, key === "disabled" ? "disabled" : "active"]);
    }
    for (const [key, assigned, agency, phone] of [
      ["leadA", "a", "agency", "+1 (415) 555-0101"],
      ["leadB", "b", "agency", "+14155550101"], // Shared household number: two people, never merged.
      ["leadNoConsent", "a", "agency", "+14155550103"],
      ["leadUnassigned", null, "agency", "+14155550104"],
      ["leadOther", "otherOwner", "otherAgency", "+14155550101"],
    ]) {
      await query("INSERT INTO public.leads(id,agency_id,name,phone,state,product,intent,assigned_to,source_path,fictional) VALUES($1,$2,$3,$4,'CA','term_life','quote',$5,'/fictional/',true)", [ids[key], ids[agency], `Fictional ${key}`, phone, assigned ? ids[assigned] : null]);
    }
    for (const lead of [ids.leadA, ids.leadB]) {
      await query("INSERT INTO public.consent_events(agency_id,lead_id,version,contact,marketing,contact_text,marketing_text) VALUES($1,$2,'fixture-v1',true,false,'Fictional contact consent','No marketing')", [ids.agency, lead]);
    }

    await t.test("configuration is agency-admin-only and maps handlers without assignment authority", async () => {
      await forbidden(() => rpc(ids.a, "configure_kixie_source", [ids.agency, "fixture", "Fictional vendor", "+12125550102", "fixture-reference"]));
      await forbidden(() => rpc(ids.otherOwner, "configure_kixie_source", [ids.agency, "fixture", "Fictional vendor", null, null]));
      await assert.rejects(() => rpc(ids.owner, "configure_kixie_source", [ids.agency, "live-number", "Rejected real number", "+12025550200", "fixture-reference"]), /KIXIE_FICTIONAL_ONLY/);
      sourceId = (await rpc(ids.owner, "configure_kixie_source", [ids.agency, "fixture", "Fictional vendor", "+12125550102", "fixture-did-verified"])).sourceId;
      await query("UPDATE public.vendor_tracking_numbers SET effective_from=$1 WHERE source_id=$2", [timeAt(-30), sourceId]);
      await assert.rejects(() => rpc(ids.owner, "map_kixie_agent", [ids.agency, ids.a, null, "a@example.com", "fixture-reference"]), /KIXIE_FICTIONAL_ONLY/);
      await rpc(ids.owner, "map_kixie_agent", [ids.agency, ids.a, null, "A@example.invalid", "fixture-agent-verified"]);
      await assert.rejects(() => rpc(ids.owner, "map_kixie_agent", [ids.agency, ids.otherOwner, "other", null, "fixture-reference"]), /AGENT_INELIGIBLE/);
      await assert.rejects(() => rpc(ids.owner, "map_kixie_agent", [ids.agency, ids.disabled, "disabled", null, "fixture-reference"]), /AGENT_INELIGIBLE/);
    });
    await t.test("ingestion requires a bound session login and has no direct table access or CRM powers", async () => {
      await forbidden(() => user(ids.owner, () => query("SELECT public.ingest_kixie_event($1,$2)", [ids.agency, event()])));
      await forbidden(() => ingress(() => query("SELECT * FROM public.leads")));
      await forbidden(() => ingress(() => query("SELECT * FROM public.kixie_calls")));
      await forbidden(() => ingress(() => query("SELECT * FROM public.kixie_ingestion_accounts")));
      await forbidden(() => ingress(() => query("SELECT public.update_lead_status($1,'sold')", [ids.leadA])));
      await forbidden(() => ingress(() => query("SELECT public.refresh_kixie_follow_up($1)", [randomUUID()])));
      await forbidden(() => ingest(event(), ids.otherAgency));
      await forbidden(() => ingest(event(), ids.agency, "kixie_test_login_b"));
      await forbidden(() => user(null, () => query("SELECT public.ingest_kixie_event($1,$2)", [ids.agency, event()]), "agency_kixie"));
      await query("UPDATE public.kixie_ingestion_accounts SET active=false WHERE runtime_role='kixie_test_login_a'");
      await forbidden(() => ingest(event()));
      await query("UPDATE public.kixie_ingestion_accounts SET active=true WHERE runtime_role='kixie_test_login_a'");
    });
    await t.test("even bound broad-privilege sessions are rejected by the database", async () => {
      await query("GRANT SELECT ON public.leads TO kixie_test_login_a");
      await assert.rejects(() => ingest(event()), /UNSAFE_INTEGRATION_ROLE/);
      await query("REVOKE SELECT ON public.leads FROM kixie_test_login_a");
      await assert.rejects(() => user(null, () => query("SELECT public.ingest_kixie_event($1,$2)", [ids.agency, event()]), "agency_kixie"), /UNSAFE_INTEGRATION_ROLE/);
    });
    await t.test("strict normalized ingress rejects raw payload, foreign agency, unsafe strings and unverified timestamps", async () => {
      for (const patch of [
        { agencyId: ids.otherAgency }, { payload: { name: "Must not persist" } },
        { recordingUrl: "https://example.invalid/recording" }, { direction: "outbound" },
        { occurredAt: "2026-10-11T12:01:00" }, { fromNumber: "(415) 555-0101" },
        { status: "sold" }, { consentStatus: "granted" }, { durationSeconds: -1 },
        { fromNumber: "+12025550200" }, { externalAgentEmail: "real@example.com" },
        { occurredAt: "2001-01-01T00:00:00Z" },
      ]) await assert.rejects(() => ingest(event(patch)), /INVALID_KIXIE_EVENT|KIXIE_FICTIONAL_ONLY|KIXIE_EVENT_AGE|check constraint/);
      assert.equal((await query("SELECT count(*)::int n FROM public.integration_events")).rows[0].n, 0);
    });
    await t.test("phone matches create separate review candidates, never create, merge or route leads", async () => {
      initialEvent = event();
      const receipt = await ingest(initialEvent);
      callId = receipt.callId;
      assert.equal(receipt.replayed, false);
      const call = await one("kixie_calls", callId);
      assert.equal(call.lead_id, null);
      assert.equal(call.mapped_agent_id, ids.a);
      assert.equal(call.vendor_source_id, sourceId);
      assert.equal(call.consent_status, "unknown");
      const candidates = (await query("SELECT lead_id,reason FROM public.lead_contact_candidates WHERE call_id=$1 ORDER BY lead_id", [callId])).rows;
      assert.deepEqual(candidates.map((r) => r.lead_id), [ids.leadA, ids.leadB].sort());
      assert(candidates.every((r) => r.reason === "phone_only_review"));
      assert.equal((await query("SELECT count(*)::int n FROM public.leads")).rows[0].n, 5);
      assert.equal((await one("leads", ids.leadA)).assigned_to, ids.a);
      assert.equal((await one("leads", ids.leadB)).assigned_to, ids.b);
      assert.equal((await query("SELECT count(*)::int n FROM public.policy_production")).rows[0].n, 0);
      for (const table of ["crm_follow_up_tasks", "notification_outbox"]) assert.equal((await query(`SELECT count(*)::int n FROM public.${table}`)).rows[0].n, 0);
      unlinkedCallId = (await ingest(event({ callId: "unmatched-call", fromNumber: "+14155550109" }))).callId;
    });
    await t.test("vendor attribution is a frozen first-observed snapshot and DID reassignment is rejected", async () => {
      await assert.rejects(() => rpc(ids.owner, "configure_kixie_source", [ids.agency, "replacement", "Fictional replacement", "+12125550102", "fixture-new-did-owner"]), /TRACKING_NUMBER_SOURCE_CONFLICT/);
      const replacement = (await rpc(ids.owner, "configure_kixie_source", [ids.agency, "replacement", "Fictional replacement", null, null])).sourceId;
      // Migration-owner-only fixture change simulates a historical DID transfer;
      // normal runtime RPC cannot perform this unsupported reassignment.
      await query("UPDATE public.vendor_tracking_numbers SET source_id=$1 WHERE phone='+12125550102'", [replacement]);
      await ingest(event({ occurredAt: timeAt(2) }));
      assert.equal((await one("kixie_calls", callId)).vendor_source_id, sourceId);
      await query("UPDATE public.vendor_tracking_numbers SET source_id=$1 WHERE phone='+12125550102'", [sourceId]);
      const unknown = (await ingest(event({ callId: "unmapped-source", toNumber: "+12125550108", trackingNumber: "+12125550108" }))).callId;
      await rpc(ids.owner, "configure_kixie_source", [ids.agency, "replacement", "Fictional replacement", "+12125550108", "fixture-later-mapping"]);
      await ingest(event({ callId: "unmapped-source", toNumber: "+12125550108", trackingNumber: "+12125550108", occurredAt: timeAt(2) }));
      assert.equal((await one("kixie_calls", unknown)).vendor_source_id, null);
      const deliveredLate = (await ingest(event({ callId: "first-delivery-before-mapping", toNumber: "+12125550108", trackingNumber: "+12125550108" }))).callId;
      assert.equal((await one("kixie_calls", deliveredLate)).vendor_source_id, null);
    });
    await t.test("replay is idempotent; conflicting hashes fail; immutable log has no personal payload", async () => {
      const replay = await ingest(initialEvent);
      assert.equal(replay.replayed, true);
      assert.equal(replay.callId, callId);
      await assert.rejects(() => ingest({ ...initialEvent, eventHash: "a".repeat(64) }), /IDEMPOTENCY_CONFLICT/);
      await assert.rejects(() => ingest({ ...initialEvent, eventId: "other-id-same-hash" }), /EVENT_HASH_CONFLICT/);
      const columns = (await query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='integration_events'")).rows.map((r) => r.column_name);
      for (const forbiddenName of ["payload", "raw_payload", "phone", "from_number", "email", "recording_url", "transcript"]) assert(!columns.includes(forbiddenName));
      await assert.rejects(() => query("UPDATE public.integration_events SET applied=false"), /IMMUTABLE_CRM_RECORD/);
      await forbidden(() => user(ids.owner, () => query("DELETE FROM public.integration_events")));
    });
    await t.test("out-of-order start/end events cannot regress terminal state, clocks or answered evidence", async () => {
      const stale = await ingest(event({ eventType: "startcall", status: "missed", occurredAt: timeAt(0), endedAt: null, durationSeconds: null }));
      assert.equal(stale.applied, false);
      const newerStart = await ingest(event({ eventType: "startcall", status: "missed", occurredAt: timeAt(2), endedAt: null, durationSeconds: null }));
      assert.equal(newerStart.applied, false);
      const tiedStart = await ingest(event({ eventType: "startcall", status: "ringing", endedAt: null }));
      assert.equal(tiedStart.applied, false);
      const unknown = await ingest(event({ occurredAt: timeAt(3), status: "unknown", durationSeconds: 10, recordingStatus: "not_provided" }));
      assert.equal(unknown.applied, true);
      const call = await one("kixie_calls", callId);
      assert.equal(call.status, "answered");
      assert.equal(call.duration_seconds, 60);
      assert.equal(call.lifecycle_rank, 3);
      assert.equal(call.recording_status, "available_unreviewed");
      const starting = await ingest(event({ callId: "start-sample", eventType: "startcall", status: "missed", endedAt: null }));
      assert.equal((await one("kixie_calls", starting.callId)).status, "ringing");
      const sameTimeEnd = await ingest(event({ callId: "start-sample", status: "missed" }));
      assert.equal(sameTimeEnd.applied, true);
      assert.equal((await one("kixie_calls", starting.callId)).status, "missed");
      await ingest(event({ callId: "start-sample", eventType: "answeredcall", status: "answered", occurredAt: timeAt(0), endedAt: null }));
      const enriched = await one("kixie_calls", starting.callId);
      assert.equal(enriched.status, "answered");
      assert.equal(enriched.lifecycle_rank, 3);
      assert.equal(new Date(enriched.last_event_at).toISOString(), timeAt(1));
    });
    await t.test("persistent rate limit counts new events, not replays, and fails atomically", async () => {
      await query("UPDATE public.rate_buckets SET hits=500,expires_at=now()+interval '1 minute' WHERE bucket=$1", [`kixie:${ids.agency}`]);
      assert.equal((await ingest(initialEvent)).replayed, true);
      await assert.rejects(() => ingest(event({ callId: "over-limit" })), /RATE_LIMITED/);
      assert.equal((await query("SELECT count(*)::int n FROM public.kixie_calls WHERE external_call_id='over-limit'")).rows[0].n, 0);
      await query("UPDATE public.rate_buckets SET expires_at=now()-interval '1 second' WHERE bucket=$1", [`kixie:${ids.agency}`]);
      await ingest(event({ callId: "after-window" }));
      assert.equal((await query("SELECT hits FROM public.rate_buckets WHERE bucket=$1", [`kixie:${ids.agency}`])).rows[0].hits, 1);
    });
    await t.test("unlinked calls/candidates are owner-only; linking needs explicit same-agency identity review", async () => {
      assert((await rows(ids.owner, "kixie_calls")).length >= 2);
      for (const id of [ids.admin, ids.a, ids.b, ids.disabled, ids.manager, ids.otherOwner]) {
        assert.deepEqual(await rows(id, "kixie_calls"), []);
        assert.deepEqual(await rows(id, "lead_contact_candidates"), []);
        assert.deepEqual(await rows(id, "integration_events"), []);
      }
      for (const id of [ids.admin, ids.a, ids.otherOwner, ids.disabled]) await forbidden(() => rpc(id, "link_kixie_call", [callId, ids.leadA, "Identity explicitly reviewed"]));
      await forbidden(() => rpc(ids.owner, "link_kixie_call", [callId, ids.leadOther, "Cross-tenant rejected"]));
      await assert.rejects(() => rpc(ids.owner, "link_kixie_call", [callId, ids.leadA, "phone"]), /IDENTITY_REVIEW_REQUIRED/);
      const linked = await rpc(ids.owner, "link_kixie_call", [callId, ids.leadA, "Fictional identity reviewed independently of phone"]);
      assert.equal(linked.lead_id, ids.leadA);
      assert.equal((await rpc(ids.owner, "link_kixie_call", [callId, ids.leadA, "Same reviewed identity"])).id, callId);
      await assert.rejects(() => rpc(ids.owner, "link_kixie_call", [callId, ids.leadB, "Different person same phone"]), /CALL_ALREADY_LINKED/);
      assert.equal((await one("leads", ids.leadA)).status, "new");
      assert.equal((await one("leads", ids.leadB)).status, "new");
    });
    await t.test("linked call read/write scope follows current assignment, never historical Kixie handler", async () => {
      assert.deepEqual((await rows(ids.a, "kixie_calls")).map((r) => r.id), [callId]);
      assert.deepEqual((await rows(ids.admin, "kixie_calls")).map((r) => r.id), [callId]);
      for (const id of [ids.b, ids.disabled, ids.manager, ids.otherOwner]) assert.deepEqual(await rows(id, "kixie_calls"), []);
      await rpc(ids.a, "update_kixie_call", [callId, { disposition: "connected", note: "Fictional call review" }]);
      assert.equal((await rows(ids.a, "kixie_call_notes")).length, 1);
      await forbidden(() => rpc(ids.b, "update_kixie_call", [callId, { note: "Forbidden" }]));
      await forbidden(() => rpc(ids.admin, "update_kixie_call", [unlinkedCallId, { note: "Unlinked owner only" }]));
      for (const patch of [{ lead_id: ids.leadB }, { assigned_to: ids.b }, { status: "sold" }, { note: null }, { follow_up_hold: null }]) await assert.rejects(() => rpc(ids.a, "update_kixie_call", [callId, patch]), /INVALID_CALL_PATCH/);
      await rpc(ids.owner, "verify_lead_routing", [ids.leadA, "CA", "term_life", "fictional-carrier", "fixture-verified-before-reassignment"]);
      await query("UPDATE public.leads SET assigned_to=$1 WHERE id=$2", [ids.b, ids.leadA]);
      assert.deepEqual(await rows(ids.a, "kixie_calls"), []);
      assert.equal((await rows(ids.b, "kixie_calls")).length, 1);
      assert.equal((await rows(ids.b, "kixie_call_notes")).length, 1);
      await forbidden(() => rpc(ids.a, "update_kixie_call", [callId, { note: "Stale owner" }]));
      await query("UPDATE public.leads SET assigned_to=$1 WHERE id=$2", [ids.a, ids.leadA]);
      await query("UPDATE public.memberships SET status='disabled' WHERE user_id=$1", [ids.a]);
      assert.deepEqual(await rows(ids.a, "kixie_calls"), []);
      await forbidden(() => rpc(ids.a, "update_kixie_call", [callId, { note: "Disabled" }]));
      await query("UPDATE public.memberships SET status='active' WHERE user_id=$1", [ids.a]);
      for (const id of [ids.owner, ids.a]) {
        for (const table of ["kixie_calls", "lead_contact_candidates", "vendor_lead_costs", "policy_production", "crm_follow_up_tasks"]) await forbidden(() => user(id, () => query(`DELETE FROM public.${table}`)));
      }
    });
    await t.test("callbacks remain held; no consent, DNC and replies suppress safely without a send path", async () => {
      await rpc(ids.a, "update_kixie_call", [callId, { disposition: "callback_requested", callback_at: "2026-10-12T14:00:00Z", follow_up_hold: false }]);
      let task = (await rows(ids.a, "crm_follow_up_tasks"))[0];
      assert.equal(task.status, "held"); assert.equal(task.hold_reason, "live_outbound_disabled");
      await rpc(ids.a, "update_kixie_call", [callId, { disposition: "replied" }]);
      task = (await rows(ids.a, "crm_follow_up_tasks"))[0];
      assert.equal(task.status, "suppressed"); assert.equal(task.hold_reason, "replied");
      await rpc(ids.a, "update_kixie_call", [callId, { disposition: "connected", follow_up_hold: false }]);
      assert.equal((await rows(ids.a, "crm_follow_up_tasks"))[0].status, "suppressed");
      const noConsentCall = (await ingest(event({ callId: "no-consent", fromNumber: "+14155550103" }))).callId;
      await rpc(ids.owner, "link_kixie_call", [noConsentCall, ids.leadNoConsent, "Independently reviewed identity"]);
      await rpc(ids.a, "update_kixie_call", [noConsentCall, { callback_at: "2026-10-12T14:00:00Z", follow_up_hold: false }]);
      task = (await query("SELECT * FROM public.crm_follow_up_tasks WHERE call_id=$1", [noConsentCall])).rows[0];
      assert.equal(task.status, "held"); assert.equal(task.hold_reason, "consent_unknown");
      await rpc(ids.a, "update_lead", [ids.leadNoConsent, { do_not_contact: true }]);
      task = (await query("SELECT * FROM public.crm_follow_up_tasks WHERE call_id=$1", [noConsentCall])).rows[0];
      assert.equal(task.status, "suppressed"); assert.equal(task.hold_reason, "do_not_contact");
      await ingest(event({ eventType: "disposition", disposition: "do_not_contact", occurredAt: timeAt(-60), status: "unknown" }));
      assert.equal((await one("leads", ids.leadA)).do_not_contact, true);
      assert.equal((await one("kixie_calls", callId)).do_not_contact, true);
      assert.equal((await rows(ids.a, "crm_follow_up_tasks")).find((r) => r.call_id === callId).hold_reason, "do_not_contact");
      assert.equal((await query("SELECT count(*)::int n FROM public.notification_outbox")).rows[0].n, 0);
      assert.equal((await query("SELECT count(*)::int n FROM public.crm_follow_up_tasks WHERE status NOT IN ('held','suppressed','cancelled')")).rows[0].n, 0);
    });
    await t.test("new routing requires verified residency/product/carrier and existing assignment eligibility", async () => {
      const routed = (await ingest(event({ callId: "route-review", fromNumber: "+14155550104" }))).callId;
      await rpc(ids.owner, "link_kixie_call", [routed, ids.leadUnassigned, "Fictional identity manually reviewed"]);
      const route = () => rpc(ids.owner, "route_kixie_call", [routed, ids.b, null, "Fictional licensed assignment"]);
      await query("UPDATE public.leads SET carrier='fictional-carrier' WHERE id=$1", [ids.leadUnassigned]);
      await query("INSERT INTO public.agent_eligibility(agency_id,user_id,state,product,carrier,active,verified,license_expires_at,verified_until,verification_reference) VALUES($1,$2,'CA','term_life','fictional-carrier',true,true,now()+interval '1 day',now()+interval '1 day','fixture-legacy-gate')", [ids.agency, ids.b]);
      await assert.rejects(() => rpc(ids.owner, "assign_lead", [ids.leadUnassigned, ids.b, null, "Legacy route must also verify facts"]), /ROUTING_FACTS_UNVERIFIED/);
      const nonKixie = randomUUID();
      await query("INSERT INTO public.leads(id,agency_id,name,state,product,carrier,intent,source_path,fictional) VALUES($1,$2,'Fictional non-Kixie','CA','term_life','fictional-carrier','quote','/fictional/',true)", [nonKixie, ids.agency]);
      assert.equal((await rpc(ids.owner, "assign_lead", [nonKixie, ids.b, null, "Existing non-Kixie rules unchanged"])).assigned_to, ids.b);
      await query("DELETE FROM public.agent_eligibility WHERE user_id=$1", [ids.b]);
      await assert.rejects(route, /ROUTING_FACTS_UNVERIFIED/);
      await forbidden(() => rpc(ids.a, "verify_lead_routing", [ids.leadUnassigned, "CA", "term_life", "fictional-carrier", "fixture-residency"]));
      await rpc(ids.owner, "verify_lead_routing", [ids.leadUnassigned, "CA", "term_life", "fictional-carrier", "fixture-residency-product-carrier"]);
      await assert.rejects(route, /AGENT_INELIGIBLE/);
      await query("INSERT INTO public.agent_eligibility(agency_id,user_id,state,product,carrier,active,verified,license_expires_at,verified_until,verification_reference) VALUES($1,$2,'NY','term_life','fictional-carrier',true,true,now()+interval '1 day',now()+interval '1 day','fixture-license')", [ids.agency, ids.b]);
      await assert.rejects(route, /AGENT_INELIGIBLE/);
      await query("UPDATE public.agent_eligibility SET state='CA' WHERE user_id=$1", [ids.b]);
      assert.equal((await route()).assigned_to, ids.b);
      await assert.rejects(route, /OWNERSHIP_CONFLICT/);
      await query("UPDATE public.leads SET state='NY' WHERE id=$1", [ids.leadUnassigned]);
      await assert.rejects(() => rpc(ids.owner, "route_kixie_call", [routed, ids.b, ids.b, "Facts changed after review"]), /ROUTING_FACTS_UNVERIFIED/);
    });
    await t.test("vendor and telephony costs are distinct, admin-only, agency-bound and bounded integers", async () => {
      await rpc(ids.owner, "record_crm_cost", [ids.agency, "vendor_lead", ids.leadA, sourceId, 2500, "USD", "fictional-vendor-invoice"]);
      await rpc(ids.admin, "record_crm_cost", [ids.agency, "telephony", callId, null, 32, "USD", "fictional-telephony-invoice"]);
      await forbidden(() => rpc(ids.a, "record_crm_cost", [ids.agency, "telephony", callId, null, 32, "USD", "forbidden-invoice"]));
      await forbidden(() => rpc(ids.otherOwner, "record_crm_cost", [ids.agency, "telephony", callId, null, 32, "USD", "forbidden-invoice"]));
      await assert.rejects(() => rpc(ids.owner, "record_crm_cost", [ids.agency, "vendor_lead", ids.leadOther, sourceId, 2500, "USD", "cross-tenant-invoice"]), /foreign key/);
      await assert.rejects(() => rpc(ids.owner, "record_crm_cost", [ids.agency, "telephony", callId, null, 9007199254740992n.toString(), "USD", "overflow-invoice"]), /check constraint/);
      for (const table of ["vendor_lead_costs", "telephony_costs"]) {
        assert.equal((await rows(ids.owner, table)).length, 1);
        assert.equal((await rows(ids.admin, table)).length, 1);
        for (const id of [ids.a, ids.b, ids.disabled, ids.otherOwner]) assert.deepEqual(await rows(id, table), []);
      }
    });
    await t.test("production facts require verification; compensation is keyed and estimated advances are not paid revenue", async () => {
      const scheduleData = { agent_id: ids.a, carrier: "fictional-carrier", product: "term_life", contract_key: "fixture-contract", effective_from: "2026-01-01", effective_until: "2026-12-31", min_issue_age: 61, max_issue_age: 80, commission_bps: 6500, advance_bps: 7500, verification_reference: "fixture-schedule" };
      const schedule = await rpc(ids.owner, "create_compensation_schedule", [ids.agency, scheduleData]);
      const policyData = { lead_id: ids.leadA, agent_id: ids.a, carrier: "fictional-carrier", product: "term_life", contract_key: "fixture-contract", external_reference: "fixture-policy-one", status: "issued", issued_at: "2026-07-01T12:00:00Z", effective_date: "2026-07-01", issue_age: 61, verification_reference: "fixture-carrier-issuance" };
      await assert.rejects(() => rpc(ids.owner, "record_policy_production", [ids.agency, { ...policyData, verification_reference: null }]), /check constraint/);
      await assert.rejects(() => rpc(ids.owner, "record_policy_production", [ids.agency, { ...policyData, issued_at: null }]), /check constraint/);
      await forbidden(() => rpc(ids.a, "record_policy_production", [ids.agency, policyData]));
      await assert.rejects(() => rpc(ids.owner, "record_policy_production", [ids.agency, { ...policyData, lead_id: ids.leadOther }]), /foreign key/);
      for (const status of ["draft", "qualified", "quoted", "application", "submitted", "approved", "declined", "not_taken"]) {
        await assert.rejects(() => rpc(ids.owner, "record_policy_production", [ids.agency, { ...policyData, status }]), /check constraint/);
      }
      await assert.rejects(() => rpc(ids.owner, "record_policy_production", [ids.agency, { ...policyData, issued_at: "2099-01-01T00:00:00Z" }]), /INVALID_ISSUANCE_TIME/);
      await assert.rejects(() => rpc(ids.owner, "record_policy_production", [ids.agency, { ...policyData, issued_at: "infinity" }]), /INVALID_ISSUANCE_TIME/);
      const policy = await rpc(ids.owner, "record_policy_production", [ids.agency, policyData]);
      await assert.rejects(() => rpc(ids.owner, "record_policy_production", [ids.agency, { ...policyData, status: "draft", issued_at: null }]), /check constraint/);
      await assert.rejects(() => rpc(ids.owner, "record_policy_production", [ids.agency, { ...policyData, issued_at: "2026-07-02T12:00:00Z" }]), /ISSUANCE_IMMUTABLE/);
      const estimate = await rpc(ids.owner, "estimate_policy_compensation", [policy.id, schedule.id, 90000, "USD"]);
      assert.equal(Number(estimate.estimated_commission_cents), 58500);
      assert.equal(Number(estimate.estimated_advance_cents), 43875);
      assert.equal((await rows(ids.owner, "policy_financial_facts")).length, 0);
      const wrongSchedule = await rpc(ids.owner, "create_compensation_schedule", [ids.agency, { ...scheduleData, min_issue_age: 18, max_issue_age: 60, verification_reference: "fixture-other-age-band" }]);
      await assert.rejects(() => rpc(ids.owner, "estimate_policy_compensation", [policy.id, wrongSchedule.id, 90000, "USD"]), /SCHEDULE_INELIGIBLE/);
      for (const [field, value] of [["agent_id", ids.b], ["carrier", "other-carrier"], ["product", "whole_life"], ["contract_key", "other-contract"], ["effective_from", "2027-01-01"]]) {
        const other = await rpc(ids.owner, "create_compensation_schedule", [ids.agency, { ...scheduleData, [field]: value, effective_until: null }]);
        await assert.rejects(() => rpc(ids.owner, "estimate_policy_compensation", [policy.id, other.id, 90000, "USD"]), /SCHEDULE_INELIGIBLE/);
      }
      await rpc(ids.owner, "record_policy_financial_fact", [policy.id, "commission_advanced", 43875, "USD", "fixture-advance-statement"]);
      await assert.rejects(() => rpc(ids.owner, "record_policy_financial_fact", [policy.id, "commission_paid", 43875, "USD", "fixture-advance-statement"]), /unique constraint/);
      await rpc(ids.owner, "record_policy_financial_fact", [policy.id, "commission_paid", 14625, "USD", "fixture-earned-paid-statement"]);
      assert.equal((await rows(ids.owner, "policy_financial_facts")).length, 2);
      await assert.rejects(() => query("UPDATE public.policy_financial_facts SET amount_cents=1"), /IMMUTABLE_CRM_RECORD/);
      await assert.rejects(() => rpc(ids.owner, "record_policy_retention", [policy.id, 30, "2026-07-15", true, "fixture-premature"]), /check constraint/);
      for (const [day, date, active] of [[30, "2026-07-31", true], [60, "2026-08-30", true], [90, "2026-09-29", false]]) await rpc(ids.owner, "record_policy_retention", [policy.id, day, date, active, `fixture-${day}-day-verification`]);
      assert.equal((await rows(ids.owner, "policy_retention_checks")).length, 3);
      await assert.rejects(() => rpc(ids.owner, "record_policy_retention", [policy.id, 90, "2099-01-01", true, "fixture-future"]), /RETENTION_UNVERIFIED/);
      assert.equal((await rows(ids.a, "policy_production")).length, 1);
      assert.deepEqual(await rows(ids.b, "policy_production"), []);
      for (const id of [ids.a, ids.b, ids.disabled, ids.otherOwner]) {
        for (const table of ["compensation_schedules", "policy_financial_facts", "policy_compensation_estimates", "policy_retention_checks"]) assert.deepEqual(await rows(id, table), []);
      }
      assert.equal((await one("leads", ids.leadA)).status, "new");
      assert.equal((await one("kixie_calls", callId)).status, "answered");
    });
    await t.test("documented raw webhook passes Node role guard and normalizer into the real ingestion RPC", async () => {
      const config = { enabled: true, secret: "fictional_integration_secret_".repeat(3), businessId: "12345", agencyId: ids.agency, fixtureOnly: true };
      const request = { headers: { "x-kixie-webhook-token": config.secret } };
      const payload = { data: { hookevent: "endcall", businessid: "12345", callDetails: {
        callid: "fictional-node-to-database", businessid: 12345,
        calldate: timeAt(0), answerDate: timeAt(0.05), callEndDate: timeAt(1),
        calltype: "incoming", callstatus: "answered", duration: 60,
        fromnumber164: "+14155550101", tonumber164: "+12125550102", email: "a@example.invalid",
        recordingurl: "https://example.invalid/never-persist-recording",
      }, crm: { token: "fictional-do-not-retain" }, apikey: "fictional-do-not-retain" } };
      // Match a direct restricted LOGIN: session_user=current_user, and the
      // ingestion-only role is inherited. No SET ROLE is used by the adapter.
      await query("ALTER ROLE kixie_test_login_a INHERIT");
      await query("GRANT agency_kixie TO kixie_test_login_a WITH INHERIT TRUE");
      let first, replay;
      await query("SET SESSION AUTHORIZATION kixie_test_login_a");
      try {
        const deps = { database: { query }, now: Date.now() };
        first = await receiveKixie(request, config, payload, deps);
        replay = await receiveKixie(request, config, payload, deps);
      } finally {
        await query(restoreSession);
        await query("ALTER ROLE kixie_test_login_a NOINHERIT");
        await query("GRANT agency_kixie TO kixie_test_login_a WITH INHERIT FALSE");
      }
      assert.equal(first.replayed, false);
      assert.equal(replay.replayed, true);
      assert.equal(first.callId, replay.callId);
      const call = await one("kixie_calls", first.callId);
      assert.equal(call.status, "answered");
      assert.equal(call.external_call_id, "fictional-node-to-database");
      assert.equal(call.duration_seconds, 60);
      assert.equal(call.lead_id, null);
      assert.equal(call.vendor_source_id, sourceId);
      assert.equal(call.recording_status, "available_unreviewed");
      const log = (await query("SELECT * FROM public.integration_events WHERE call_id=$1", [first.callId])).rows;
      assert.equal(log.length, 1);
      assert.equal(log[0].event_type, "endcall");
      assert(!JSON.stringify([call, log]).includes("fictional-do-not-retain"));
      assert(!JSON.stringify([call, log]).includes("https://"));
    });
    await t.test("separate PostgreSQL connections serialize simultaneous duplicate ingestion", { skip: !external }, async () => {
      const clients = [new pg.Client({ connectionString: databaseUrl }), new pg.Client({ connectionString: databaseUrl })];
      const data = event({ callId: "concurrent-fixture" });
      try {
        await Promise.all(clients.map(async (client) => { await client.connect(); await client.query("SET SESSION AUTHORIZATION kixie_test_login_a"); await client.query("SET ROLE agency_kixie"); }));
        const receipts = await Promise.all(clients.map(async (client) => (await client.query("SELECT public.ingest_kixie_event($1,$2) AS result", [ids.agency, data])).rows[0].result));
        assert.equal(receipts[0].callId, receipts[1].callId);
        assert.deepEqual(receipts.map((r) => r.replayed).sort(), [false, true]);
      } finally { await Promise.all(clients.map((client) => client.end())); }
    });
  } finally {
    if (external) {
      await db.end();
      await adminDatabase.query(`DROP DATABASE ${testDatabase}`);
      await adminDatabase.end();
    } else await db.close();
  }
});
