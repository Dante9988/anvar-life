import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { config, CONSENT } from "../server/config.mjs";
import { intake, leadPatch } from "../server/validation.mjs";
import { origin, csrf, body, equal } from "../server/http.mjs";
import handler from "../api/index.mjs";
const payload = () => ({
  name: "Fictional Example",
  email: "fictional@example.test",
  phone: "",
  state: "CA",
  product: "term_life",
  intent: "quote",
  consent: { contact: true, marketing: false, version: CONSENT.version },
  utm: { source: "test" },
  sourcePath: "/find-coverage/",
  fictional: true,
  ageRange: "40-59",
  budget: null,
  interest: "family",
  preferredContact: "email",
});
function fails(fn, status) {
  assert.throws(fn, (e) => e.status === status);
}
test("configuration defaults disabled and never enables real collection", () => {
  assert.equal(config({}).intakeEnabled, false);
  assert.equal(
    config({ APP_MODE: "production", INTAKE_ENABLED: "true" }).mode,
    "disabled",
  );
  assert.equal(
    config({ APP_ORIGIN: "https://example.test/path" }).configured,
    false,
  );
});
test("intake normalizes allowlisted fictional data and optional bands", () => {
  const p = intake(payload());
  assert.equal(p.email, "fictional@example.test");
  assert.equal(p.budget, null);
  assert.equal(p.ageRange, "40-59");
  assert.equal(p.sourcePath, "/find-coverage/");
});
test("intake rejects real data flag, roles, injection fields and bad consent", () => {
  fails(() => intake({ ...payload(), fictional: false }), 403);
  fails(() => intake({ ...payload(), agency_id: "another" }), 400);
  fails(() => intake({ ...payload(), assigned_to: "another" }), 400);
  fails(
    () =>
      intake({
        ...payload(),
        consent: { contact: true, marketing: true, version: "old" },
      }),
    400,
  );
  fails(
    () =>
      intake({
        ...payload(),
        consent: { contact: false, marketing: false, version: CONSENT.version },
      }),
    400,
  );
  fails(() => intake({ ...payload(), website: "spam" }), 400);
});
test("intake strictly validates enums contacts body lengths and attribution", () => {
  for (const change of [
    { state: "XX" },
    { product: "hacked" },
    { email: "bad", phone: "" },
    { phone: "bad phone" },
    { name: "x".repeat(162) },
    { utm: { email: "person@example.test" } },
    { utm: { source: "x".repeat(151) } },
    { ageRange: "minor" },
    { budget: "arbitrary" },
    { preferredContact: "fax" },
  ])
    fails(() => intake({ ...payload(), ...change }), 400);
});
test("PATCH cannot change ownership or tenant; dates and DNC strict", () => {
  assert.deepEqual(
    leadPatch({ status: "sold", do_not_contact: true, follow_up_at: null }),
    { status: "sold", do_not_contact: true, follow_up_at: null },
  );
  fails(() => leadPatch({ assigned_to: "abc" }), 400);
  fails(() => leadPatch({ agency_id: "abc" }), 400);
  fails(() => leadPatch({ do_not_contact: "true" }), 400);
  fails(() => leadPatch({ follow_up_at: "yesterday" }), 400);
  fails(() => leadPatch({}), 400);
});
test("exact Origin and CSRF token required; no permissive CORS", () => {
  const c = { origin: "https://agency.test", secure: true };
  const req = {
    headers: {
      origin: c.origin,
      cookie: "__Host-agency-csrf=good",
      "x-csrf-token": "good",
    },
  };
  assert.doesNotThrow(() => csrf(req, c));
  fails(
    () => origin({ headers: { origin: "https://agency.test.evil" } }, c),
    403,
  );
  fails(
    () =>
      csrf({ ...req, headers: { ...req.headers, "x-csrf-token": "bad" } }, c),
    403,
  );
  fails(() => csrf({ headers: { origin: c.origin } }, c), 403);
  assert.equal(equal("😀", "aaaa"), false);
});
test("JSON parsing rejects wrong content type malformed and oversized data", async () => {
  function req(value, type = "application/json") {
    const r = Readable.from([value]);
    r.headers = { "content-type": type };
    return r;
  }
  assert.deepEqual(await body(req('{"ok":true}')), { ok: true });
  await assert.rejects(body(req("invalid")), (e) => e.status === 400);
  await assert.rejects(body(req("{}", "text/plain")), (e) => e.status === 415);
  await assert.rejects(body(req("x".repeat(17000))), (e) => e.status === 413);
});
test("unconfigured API is explicit no-store and never simulates successful writes", async () => {
  const old = process.env.APP_MODE;
  delete process.env.APP_MODE;
  function response() {
    return {
      headers: {},
      setHeader(k, v) {
        this.headers[k] = v;
      },
      getHeader(k) {
        return this.headers[k];
      },
      end(v) {
        this.body = v;
      },
    };
  }
  try {
    const r = response();
    await handler({ url: "/api/config", method: "GET", headers: {} }, r);
    assert.equal(r.statusCode, 200);
    assert.equal(JSON.parse(r.body).intakeEnabled, false);
    assert.match(r.headers["Cache-Control"], /no-store/);
    const write = response();
    await handler({ url: "/api/intake", method: "POST", headers: {} }, write);
    assert.equal(write.statusCode, 503);
    assert.equal(JSON.parse(write.body).error.code, "NOT_CONFIGURED");
    assert.ok(!JSON.parse(write.body).accepted);
  } finally {
    if (old === undefined) delete process.env.APP_MODE;
    else process.env.APP_MODE = old;
  }
});

test("logout revokes refresh-only sessions and clears locally with explicit warning on provider failure", async () => {
  const { logout } = await import("../server/auth.mjs");
  const c = {
    secure: true,
    supabaseUrl: "https://auth.example.test",
    key: "public",
  };
  const response = () => ({
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    getHeader(k) {
      return this.headers[k];
    },
  });
  let refreshCalls = 0,
    revokeCalls = 0;
  const deps = {
    refreshSession: async (v) => {
      assert.equal(v, "refresh-only");
      refreshCalls++;
      return { data: { session: { access_token: "new-access" } } };
    },
    revoke: async (v) => {
      assert.equal(v, "new-access");
      revokeCalls++;
      return { ok: true, status: 204 };
    },
  };
  const res = response();
  await logout(
    { headers: { cookie: "__Host-agency-refresh=refresh-only" } },
    res,
    c,
    deps,
  );
  assert.equal(refreshCalls, 1);
  assert.equal(revokeCalls, 1);
  assert.equal(res.headers["Set-Cookie"].length, 4);
  const failed = response();
  const uncertain = await logout(
    { headers: { cookie: "__Host-agency-access=old" } },
    failed,
    c,
    {
      revoke: async () => ({ ok: false, status: 500 }),
    },
  );
  assert.equal(uncertain.localSignedOut, true);
  assert.equal(uncertain.remoteRevocationConfirmed, false);
  assert.equal(uncertain.signedOut, undefined);
  assert.match(uncertain.warning, /could not be confirmed/);
  assert.equal(failed.headers["Set-Cookie"].length, 4);
  assert.ok(
    failed.headers["Set-Cookie"].every((value) => value.includes("Max-Age=0")),
  );
});
test("logout refreshes expired access and retries revocation exactly once", async () => {
  const { logout } = await import("../server/auth.mjs");
  const calls = [];
  const res = {
    setHeader() {},
    getHeader() {
      return [];
    },
  };
  await logout(
    { headers: { cookie: "agency-access=expired; agency-refresh=valid" } },
    res,
    { secure: false },
    {
      revoke: async (token) => {
        calls.push(token);
        return token === "expired"
          ? { ok: false, status: 401 }
          : { ok: true, status: 204 };
      },
      refreshSession: async () => ({
        data: { session: { access_token: "fresh" } },
      }),
    },
  );
  assert.deepEqual(calls, ["expired", "fresh"]);
});
test("OAuth callback rejects missing verifier or arbitrary redirect before remote exchange", async () => {
  const { finishLogin } = await import("../server/auth.mjs");
  await assert.rejects(
    finishLogin(
      { headers: {} },
      {},
      { secure: true },
      new URL("https://agency.test/api/auth/callback?code=x"),
    ),
    (e) => e.status === 400,
  );
  await assert.rejects(
    finishLogin(
      { headers: { cookie: "__Host-agency-pkce=verifier" } },
      {},
      { secure: true },
      new URL(
        "https://agency.test/api/auth/callback?code=x&next=https://evil.test",
      ),
    ),
    (e) => e.status === 400,
  );
});

test("server independently removes likely personal attribution before persistence", () => {
  for (const unsafe of [
    "person@example.test",
    "5551234567",
    "ssn-123-45-6789",
    "birth-1970",
    "contact-alice",
    "mobile-5551234",
    "example.com",
    "https://example.test/?email=private",
    "www.example.test",
    "phone-number",
  ]) {
    const normalized = intake({
      ...payload(),
      utm: { source: "google", content: unsafe },
    });
    assert.deepEqual(normalized.utm, { source: "google" });
    assert.ok(!JSON.stringify(normalized.utm).includes(unsafe));
  }
  fails(
    () => intake({ ...payload(), utm: { campaign: "x".repeat(101) } }),
    400,
  );
  fails(
    () => intake({ ...payload(), utm: { campaign: ["first", "second"] } }),
    400,
  );
  fails(() => intake({ ...payload(), utm: { referrer: "private" } }), 400);
});

test("safe attribution preserves campaign and standard email medium with stable ordering", () => {
  const first = intake({
    ...payload(),
    utm: { campaign: "fall_2026", medium: "email", source: "newsletter" },
  });
  const second = intake({
    ...payload(),
    utm: { source: "newsletter", campaign: "fall_2026", medium: "email" },
  });
  assert.deepEqual(first.utm, {
    source: "newsletter",
    medium: "email",
    campaign: "fall_2026",
  });
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test("intake runtime guard rejects any direct public-table privileges and ownership", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../server/intake.mjs", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER/,
  );
  assert.match(source, /t\.relowner=r\.oid/);
  assert.match(source, /runtime\.rows\[0\]\.can_access_tables/);
  assert.match(source, /runtime\.rows\[0\]\.rolbypassrls/);
});

test("real Postgres guard catches write-only roles even without SELECT", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { INTAKE_ROLE_CHECK_SQL } = await import("../server/intake.mjs");
  const db = new PGlite();
  try {
    await db.exec(
      "CREATE ROLE intake_guard_test; CREATE TABLE public.guard_test(id integer); SET ROLE intake_guard_test;",
    );
    assert.equal(
      (await db.query(INTAKE_ROLE_CHECK_SQL)).rows[0].can_access_tables,
      false,
    );
    await db.exec(
      "RESET ROLE; GRANT UPDATE ON public.guard_test TO intake_guard_test; SET ROLE intake_guard_test;",
    );
    assert.equal(
      (await db.query(INTAKE_ROLE_CHECK_SQL)).rows[0].can_access_tables,
      true,
    );
    assert.equal(
      (
        await db.query(
          "SELECT has_table_privilege(current_user,'public.guard_test','SELECT') AS allowed",
        )
      ).rows[0].allowed,
      false,
    );
  } finally {
    await db.close();
  }
});
