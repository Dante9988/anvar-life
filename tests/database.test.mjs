import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import {
  createPostgresOutboxStore,
  createMemoryMailSink,
  dispatchPreviewNotifications,
} from "../server/notifications.mjs";

const ids = Object.fromEntries(
  [
    "agency",
    "otherAgency",
    "owner",
    "admin",
    "a",
    "b",
    "disabled",
    "manager",
    "otherOwner",
    "uninvited",
    "invited",
    "wrongProvider",
    "leadA",
    "leadB",
    "unassigned",
    "otherLead",
  ].map((name, i) => [
    name,
    `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  ]),
);
const payload = {
  name: "Fictional Example",
  email: "fictional@example.invalid",
  phone: "",
  state: "CA",
  product: "term_life",
  intent: "quote",
  sourcePath: "/find-coverage/",
  fictional: true,
  consent: { contact: true, marketing: false, version: "2026-10-10.v1" },
};

test("real PostgreSQL migrations and adversarial role isolation", async (t) => {
  const external = Boolean(process.env.TEST_DATABASE_URL);
  const db = external
    ? new pg.Client({ connectionString: process.env.TEST_DATABASE_URL })
    : new PGlite();
  if (external) await db.connect();
  const query = (sql, params = []) => db.query(sql, params);
  const exec = (sql) => (external ? db.query(sql) : db.exec(sql));
  const user = async (id, fn, role = "authenticated") => {
    await query(`SET ROLE ${role}`);
    await query("SELECT set_config('request.jwt.claim.sub',$1,false)", [
      id || "",
    ]);
    try {
      return await fn();
    } finally {
      await query("RESET ROLE");
      await query("SELECT set_config('request.jwt.claim.sub','',false)");
    }
  };
  const select = async (id) =>
    user(id, async () =>
      (await query("SELECT id FROM public.leads ORDER BY id")).rows.map(
        (r) => r.id,
      ),
    );
  const forbidden = (fn) =>
    assert.rejects(
      fn,
      /permission denied|NOT_FOUND|FORBIDDEN|INVITATION_REQUIRED|MEMBERSHIP_DISABLED/i,
    );
  try {
    await exec(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE supabase_auth_admin NOLOGIN;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text NOT NULL,email_confirmed_at timestamptz,raw_app_meta_data jsonb NOT NULL DEFAULT '{}');
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,supabase_auth_admin; GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;`);
    await exec(
      await readFile(
        new URL("../database/001_agency.sql", import.meta.url),
        "utf8",
      ),
    );
    await exec(
      await readFile(
        new URL("../database/002_notification_preview.sql", import.meta.url),
        "utf8",
      ),
    );
    await query("INSERT INTO public.agencies(id,name) VALUES ($1,$2),($3,$4)", [
      ids.agency,
      "Fictional Agency",
      ids.otherAgency,
      "Other Fictional Agency",
    ]);
    for (const key of [
      "owner",
      "admin",
      "a",
      "b",
      "disabled",
      "manager",
      "otherOwner",
      "uninvited",
      "invited",
      "wrongProvider",
    ]) {
      await query("INSERT INTO auth.users VALUES ($1,$2,now(),$3)", [
        ids[key],
        `${key}@example.invalid`,
        { provider: key === "wrongProvider" ? "email" : "google" },
      ]);
      if (["uninvited", "invited", "wrongProvider"].includes(key)) continue;
      const role =
        key === "owner" || key === "otherOwner"
          ? "owner"
          : key === "admin"
            ? "admin"
            : key === "manager"
              ? "manager"
              : "agent";
      await query(
        "INSERT INTO public.memberships(agency_id,user_id,email,role,status,verified) VALUES($1,$2,$3,$4,$5,true)",
        [
          key === "otherOwner" ? ids.otherAgency : ids.agency,
          ids[key],
          `${key}@example.invalid`,
          role,
          key === "disabled" ? "disabled" : "active",
        ],
      );
    }
    for (const [key, assignee, agency] of [
      ["leadA", "a", "agency"],
      ["leadB", "b", "agency"],
      ["unassigned", null, "agency"],
      ["otherLead", "otherOwner", "otherAgency"],
    ]) {
      await query(
        `INSERT INTO public.leads(id,agency_id,name,email,state,product,intent,assigned_to,source_path,fictional) VALUES($1,$2,'Fictional Lead','fictional@example.invalid','CA','term_life','quote',$3,'/',true)`,
        [ids[key], ids[agency], assignee ? ids[assignee] : null],
      );
      await query(
        "INSERT INTO public.lead_events(agency_id,lead_id,event) VALUES($1,$2,'created')",
        [ids[agency], ids[key]],
      );
      await query(
        "INSERT INTO public.consent_events(agency_id,lead_id,version,contact,marketing,contact_text,marketing_text) VALUES($1,$2,'test',true,false,'Fictional contact consent','Optional marketing')",
        [ids[agency], ids[key]],
      );
    }
    await t.test(
      "agents see only assigned rows; owner/admin see agency; disabled/manager/uninvited see none",
      async () => {
        assert.deepEqual(await select(ids.a), [ids.leadA]);
        assert.deepEqual(await select(ids.b), [ids.leadB]);
        for (const key of ["owner", "admin"])
          assert.deepEqual(await select(ids[key]), [
            ids.leadA,
            ids.leadB,
            ids.unassigned,
          ]);
        for (const key of ["disabled", "manager", "uninvited"])
          assert.deepEqual(await select(ids[key]), []);
        assert.deepEqual(await select(ids.otherOwner), [ids.otherLead]);
        await forbidden(() =>
          user(null, () => query("SELECT * FROM public.leads"), "anon"),
        );
      },
    );
    await t.test(
      "counts, search, detail and timeline stay under database row security",
      async () => {
        await user(ids.a, async () => {
          assert.equal(
            (await query("SELECT count(*)::int AS n FROM public.leads")).rows[0]
              .n,
            1,
          );
          assert.equal(
            (await query("SELECT * FROM public.leads WHERE id=$1", [ids.leadB]))
              .rows.length,
            0,
          );
          assert.equal(
            (
              await query(
                "SELECT * FROM public.leads WHERE name ILIKE '%Fictional%'",
              )
            ).rows.length,
            1,
          );
          assert.equal(
            (await query("SELECT * FROM public.lead_events")).rows.length,
            1,
          );
          assert.equal(
            (await query("SELECT * FROM public.consent_events")).rows.length,
            1,
          );
        });
      },
    );
    await t.test(
      "direct writes, self-assignment, memberships and outbox access are denied",
      async () => {
        for (const id of [ids.a, ids.owner]) {
          await forbidden(() =>
            user(id, () =>
              query("UPDATE public.leads SET status='closed' WHERE id=$1", [
                ids.leadA,
              ]),
            ),
          );
          await forbidden(() =>
            user(id, () =>
              query("UPDATE public.leads SET assigned_to=$1 WHERE id=$2", [
                ids.a,
                ids.unassigned,
              ]),
            ),
          );
          await forbidden(() =>
            user(id, () =>
              query(
                "UPDATE public.memberships SET role='owner' WHERE user_id=$1",
                [ids.a],
              ),
            ),
          );
          await forbidden(() =>
            user(id, () => query("SELECT * FROM public.notification_outbox")),
          );
          await forbidden(() =>
            user(id, () => query("DELETE FROM public.consent_events")),
          );
        }
      },
    );
    await t.test(
      "status RPC rechecks assignment and records audited mutation",
      async () => {
        await user(ids.a, () =>
          query("SELECT public.update_lead_status($1,'contacted')", [
            ids.leadA,
          ]),
        );
        await forbidden(() =>
          user(ids.a, () =>
            query("SELECT public.update_lead_status($1,'closed')", [ids.leadB]),
          ),
        );
        await forbidden(() =>
          user(ids.otherOwner, () =>
            query("SELECT public.update_lead_status($1,'closed')", [ids.leadA]),
          ),
        );
        await forbidden(() =>
          user(ids.disabled, () =>
            query("SELECT public.update_lead_status($1,'closed')", [ids.leadA]),
          ),
        );
        assert.equal(
          (
            await query(
              "SELECT count(*)::int n FROM public.lead_events WHERE event='status_changed' AND actor_id=$1",
              [ids.a],
            )
          ).rows[0].n,
          1,
        );
      },
    );
    await t.test(
      "follow-up, opt-out and note RPCs preserve ownership and audit immutability",
      async () => {
        await user(ids.a, () =>
          query("SELECT public.update_lead($1,$2)", [
            ids.leadA,
            {
              status: "application",
              do_not_contact: true,
              follow_up_at: "2026-11-01T12:00:00Z",
            },
          ]),
        );
        await user(ids.a, () =>
          query("SELECT public.add_lead_note($1,$2)", [
            ids.leadA,
            "Fictional scheduling note only",
          ]),
        );
        await forbidden(() =>
          user(ids.b, () =>
            query("SELECT public.add_lead_note($1,$2)", [
              ids.leadA,
              "Forbidden note",
            ]),
          ),
        );
        await forbidden(() =>
          user(ids.b, () =>
            query("SELECT public.update_lead($1,$2)", [
              ids.leadA,
              { status: "sold" },
            ]),
          ),
        );
        await assert.rejects(
          () =>
            user(ids.a, () =>
              query("SELECT public.update_lead($1,$2)", [
                ids.leadA,
                { assigned_to: ids.a },
              ]),
            ),
          /INVALID_PATCH/,
        );
        await assert.rejects(
          () =>
            user(ids.a, () =>
              query("SELECT public.add_lead_note($1,NULL)", [ids.leadA]),
            ),
          /INVALID_NOTE/,
        );
        await forbidden(() =>
          user(ids.owner, () =>
            query(
              "UPDATE public.lead_events SET detail='{}' WHERE lead_id=$1",
              [ids.leadA],
            ),
          ),
        );
        const lead = (
          await query(
            "SELECT status,do_not_contact FROM public.leads WHERE id=$1",
            [ids.leadA],
          )
        ).rows[0];
        assert.equal(lead.status, "application");
        assert.equal(lead.do_not_contact, true);
      },
    );
    await t.test(
      "assignment requires verified carrier and eligible state/product/expiry; stale ownership rejected",
      async () => {
        const assign = () =>
          user(ids.owner, () =>
            query("SELECT public.assign_lead($1,$2,NULL,$3)", [
              ids.unassigned,
              ids.a,
              "Fictional review",
            ]),
          );
        await assert.rejects(assign, /CARRIER_UNVERIFIED/);
        await query(
          "UPDATE public.leads SET carrier='fictional-carrier' WHERE id=$1",
          [ids.unassigned],
        );
        await assert.rejects(assign, /AGENT_INELIGIBLE/);
        await query(
          "INSERT INTO public.agent_eligibility(agency_id,user_id,state,product,carrier,active,verified,license_expires_at,verified_until,verification_reference) VALUES($1,$2,'NY','term_life','fictional-carrier',true,true,now()+interval '1 day',now()+interval '1 day','fictional-test-only')",
          [ids.agency, ids.a],
        );
        await assert.rejects(assign, /AGENT_INELIGIBLE/);
        await query(
          "UPDATE public.agent_eligibility SET state='CA',license_expires_at=now()-interval '1 day' WHERE user_id=$1",
          [ids.a],
        );
        await assert.rejects(assign, /AGENT_INELIGIBLE/);
        await query(
          "UPDATE public.agent_eligibility SET license_expires_at=now()+interval '1 day' WHERE user_id=$1",
          [ids.a],
        );
        await assert.rejects(
          () =>
            user(ids.owner, () =>
              query("SELECT public.assign_lead($1,$2,NULL,NULL)", [
                ids.unassigned,
                ids.a,
              ]),
            ),
          /INVALID_REASON/,
        );
        await assign();
        await assert.rejects(assign, /OWNERSHIP_CONFLICT/);
        await forbidden(() =>
          user(ids.a, () =>
            query("SELECT public.assign_lead($1,$2,$3,$4)", [
              ids.unassigned,
              ids.b,
              ids.a,
              "Attempted reassignment",
            ]),
          ),
        );
      },
    );
    await t.test(
      "invitation permissions and Google-only acceptance fail closed",
      async () => {
        await forbidden(() =>
          user(ids.a, () =>
            query(
              "SELECT public.create_invitation($1,'new@example.invalid','agent')",
              [ids.agency],
            ),
          ),
        );
        await forbidden(() =>
          user(ids.admin, () =>
            query(
              "SELECT public.create_invitation($1,'new@example.invalid','admin')",
              [ids.agency],
            ),
          ),
        );
        await user(ids.owner, () =>
          query(
            "SELECT public.create_invitation($1,'invited@example.invalid','agent')",
            [ids.agency],
          ),
        );
        await user(ids.invited, () =>
          query("SELECT public.accept_invitation()"),
        );
        await forbidden(() =>
          user(ids.uninvited, () => query("SELECT public.accept_invitation()")),
        );
        await forbidden(() =>
          user(ids.wrongProvider, () =>
            query("SELECT public.accept_invitation()"),
          ),
        );
        await forbidden(() =>
          user(ids.disabled, () => query("SELECT public.accept_invitation()")),
        );
      },
    );
    await t.test(
      "owner bootstrap is exact-email, expiring, single-use and not a client privilege",
      async () => {
        const agency = randomUUID(),
          owner = randomUUID();
        await query(
          "INSERT INTO public.agencies VALUES($1,'Fictional Bootstrap Agency')",
          [agency],
        );
        await query(
          "INSERT INTO auth.users VALUES($1,'bootstrap@example.invalid',now(),'{\"provider\":\"google\"}')",
          [owner],
        );
        await query(
          "INSERT INTO public.owner_bootstrap(agency_id,email,expires_at) VALUES($1,'bootstrap@example.invalid',now()-interval '1 hour')",
          [agency],
        );
        await forbidden(() =>
          user(owner, () => query("SELECT public.accept_invitation()")),
        );
        await query(
          "UPDATE public.owner_bootstrap SET expires_at=now()+interval '1 hour' WHERE agency_id=$1",
          [agency],
        );
        const hook = async (email) =>
          user(
            null,
            () =>
              query("SELECT public.before_user_created($1) AS result", [
                { user: { email, app_metadata: { provider: "google" } } },
              ]),
            "supabase_auth_admin",
          );
        assert.equal(
          (await hook("stranger@example.invalid")).rows[0].result.error
            .http_code,
          403,
        );
        assert.deepEqual(
          (await hook("bootstrap@example.invalid")).rows[0].result,
          {},
        );
        await forbidden(() =>
          user(ids.a, () => query("SELECT * FROM public.owner_bootstrap")),
        );
        await user(owner, () => query("SELECT public.accept_invitation()"));
        assert.equal(
          (
            await query(
              "SELECT role FROM public.memberships WHERE user_id=$1",
              [owner],
            )
          ).rows[0].role,
          "owner",
        );
        assert.equal(
          (
            await query(
              "SELECT consumed_by FROM public.owner_bootstrap WHERE agency_id=$1",
              [agency],
            )
          ).rows[0].consumed_by,
          owner,
        );
        assert.equal(
          (await hook("bootstrap@example.invalid")).rows[0].result.error
            .http_code,
          403,
        );
        await user(owner, () => query("SELECT public.accept_invitation()"));
        assert.equal(
          (
            await query(
              "SELECT count(*)::int n FROM public.memberships WHERE user_id=$1",
              [owner],
            )
          ).rows[0].n,
          1,
        );
      },
    );
    await t.test(
      "restricted intake writes atomically, deduplicates retries, limits abuse and cannot read leads",
      async () => {
        const key = randomUUID();
        const submit = (k = key, hash = "fixed-hash", data = payload) =>
          user(
            null,
            () =>
              query(
                "SELECT public.submit_intake($1,$2,$3,$4,$5,$6,$7) AS result",
                [
                  ids.agency,
                  k,
                  hash,
                  "fictional-bucket",
                  data,
                  "Fictional contact consent",
                  "Optional marketing",
                ],
              ),
            "agency_intake",
          );
        await forbidden(() =>
          user(
            null,
            () => query("SELECT * FROM public.leads"),
            "agency_intake",
          ),
        );
        const first = (await submit()).rows[0].result,
          second = (await submit()).rows[0].result;
        assert.equal(first.replayed, false);
        assert.equal(second.replayed, true);
        assert.equal(first.receipt, second.receipt);
        await assert.rejects(
          () => submit(key, "different-hash"),
          /IDEMPOTENCY_CONFLICT/,
        );
        assert.equal(
          (
            await query(
              "SELECT count(*)::int n FROM public.consent_events WHERE lead_id=$1",
              [first.receipt],
            )
          ).rows[0].n,
          1,
        );
        assert.equal(
          (
            await query(
              "SELECT count(*)::int n FROM public.notification_outbox WHERE lead_id=$1",
              [first.receipt],
            )
          ).rows[0].n,
          1,
        );
        await assert.rejects(
          () =>
            submit(randomUUID(), "invalid", {
              ...payload,
              consent: { ...payload.consent, contact: false },
            }),
          /INVALID_CONSENT/,
        );
        for (let i = 0; i < 4; i++) await submit(randomUUID(), `hash-${i}`);
        await assert.rejects(
          () => submit(randomUUID(), "over-limit"),
          /RATE_LIMITED/,
        );
        const columns = (
          await query(
            "SELECT column_name FROM information_schema.columns WHERE table_name='notification_outbox'",
          )
        ).rows.map((r) => r.column_name);
        for (const forbiddenName of [
          "name",
          "email",
          "phone",
          "payload",
          "body",
        ])
          assert(!columns.includes(forbiddenName));
      },
    );
    await t.test(
      "real database outbox leases, authorization rechecks, retries and fictional sink",
      async () => {
        await query(
          "UPDATE public.notification_outbox SET status='suppressed'",
        );
        const row = async (lead = ids.leadB, attempts = 0) =>
          (
            await query(
              "INSERT INTO public.notification_outbox(agency_id,lead_id,event,attempts) VALUES($1,$2,'assigned',$3) RETURNING id",
              [ids.agency, lead, attempts],
            )
          ).rows[0].id;
        const store = createPostgresOutboxStore({
          query: (sql, params) =>
            user(null, () => query(sql, params), "agency_outbox"),
        });
        await forbidden(() =>
          user(
            null,
            () => query("SELECT * FROM public.leads"),
            "agency_outbox",
          ),
        );
        await forbidden(() =>
          user(ids.a, () =>
            query("SELECT public.claim_preview_notifications(1)"),
          ),
        );
        const eventId = await row();
        const items = await store.claim(1);
        assert.equal(items.length, 1);
        assert.equal(items[0].id, eventId);
        assert.deepEqual(await store.claim(1), []);
        assert.equal(
          await store.finish(
            { ...items[0], leaseToken: randomUUID() },
            "simulated",
          ),
          false,
        );
        const recipient = await store.resolve(items[0]);
        assert.equal(recipient.recipientId, ids.b);
        assert.equal(Object.hasOwn(recipient, "name"), false);
        assert.equal(Object.hasOwn(recipient, "phone"), false);
        await query(
          "UPDATE public.memberships SET status='disabled' WHERE user_id=$1",
          [ids.b],
        );
        assert.equal(await store.resolve(items[0]), null);
        await query(
          "UPDATE public.memberships SET status='active' WHERE user_id=$1",
          [ids.b],
        );
        assert.equal(await store.finish(items[0], "retry"), true);
        assert.deepEqual(await store.claim(1), []);
        await query(
          "UPDATE public.notification_outbox SET available_at=now() WHERE id=$1",
          [eventId],
        );
        const sink = createMemoryMailSink();
        const result = await dispatchPreviewNotifications({
          mode: "fictional_preview",
          enabled: true,
          origin: "https://fictional.example",
          store,
          sink,
        });
        assert.equal(result.simulated, 1);
        assert.equal(sink.messages.size, 1);
        const message = [...sink.messages.values()][0];
        assert.equal(message.to, "b@example.invalid");
        assert(!message.text.includes("Fictional Lead"));
        assert(!message.text.includes("fictional@example.invalid"));
        assert.equal(
          (
            await query(
              "SELECT status FROM public.notification_outbox WHERE id=$1",
              [eventId],
            )
          ).rows[0].status,
          "simulated",
        );
        const dncId = await row(ids.leadA);
        assert.deepEqual(await store.claim(1), []);
        assert.equal(
          (
            await query(
              "SELECT status FROM public.notification_outbox WHERE id=$1",
              [dncId],
            )
          ).rows[0].status,
          "suppressed",
        );
        const exhaustedId = await row(ids.leadB, 5);
        assert.deepEqual(await store.claim(1), []);
        assert.equal(
          (
            await query(
              "SELECT status FROM public.notification_outbox WHERE id=$1",
              [exhaustedId],
            )
          ).rows[0].status,
          "failed",
        );
        await query("UPDATE public.leads SET fictional=false WHERE id=$1", [
          ids.leadB,
        ]);
        const realFlagId = await row(ids.leadB);
        assert.deepEqual(await store.claim(1), []);
        assert.equal(
          (
            await query(
              "SELECT status FROM public.notification_outbox WHERE id=$1",
              [realFlagId],
            )
          ).rows[0].status,
          "pending",
        );
        await query("UPDATE public.leads SET fictional=true WHERE id=$1", [
          ids.leadB,
        ]);
      },
    );
    await t.test(
      "independent PostgreSQL connections serialize simultaneous duplicate submissions",
      { skip: !external },
      async () => {
        const clients = [
          new pg.Client({ connectionString: process.env.TEST_DATABASE_URL }),
          new pg.Client({ connectionString: process.env.TEST_DATABASE_URL }),
        ];
        const key = randomUUID();
        try {
          await Promise.all(
            clients.map(async (c) => {
              await c.connect();
              await c.query("SET ROLE agency_intake");
            }),
          );
          const results = await Promise.all(
            clients.map((c) =>
              c.query(
                "SELECT public.submit_intake($1,$2,$3,$4,$5,$6,$7) AS result",
                [
                  ids.agency,
                  key,
                  "concurrent-hash",
                  "concurrent-fictional-bucket",
                  payload,
                  "Fictional contact consent",
                  "Optional marketing",
                ],
              ),
            ),
          );
          const receipts = results.map((r) => r.rows[0].result);
          assert.equal(receipts[0].receipt, receipts[1].receipt);
          assert.deepEqual(receipts.map((r) => r.replayed).sort(), [
            false,
            true,
          ]);
          assert.equal(
            (
              await query(
                "SELECT count(*)::int n FROM public.leads WHERE id=$1",
                [receipts[0].receipt],
              )
            ).rows[0].n,
            1,
          );
        } finally {
          await Promise.all(clients.map((c) => c.end()));
        }
      },
    );
  } finally {
    if (external) await db.end();
    else await db.close();
  }
});
