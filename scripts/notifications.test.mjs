import test from "node:test";
import assert from "node:assert/strict";
import {
  createMemoryMailSink,
  dispatchPreviewNotifications,
} from "../server/notifications.mjs";
const item = {
  id: "11111111-1111-4111-8111-111111111111",
  leaseToken: "lease",
};
function fixture({ recipient = true, fail = false } = {}) {
  const outcomes = [];
  return {
    outcomes,
    store: {
      claim: async () => [item],
      resolve: async () =>
        recipient
          ? {
              recipientId: "agent",
              recipientEmail: "agent@example.test",
              portalPath:
                "/admin/leads?lead=22222222-2222-4222-8222-222222222222",
              name: "DO NOT COPY",
              phone: "DO NOT COPY",
            }
          : null,
      finish: async (_, outcome) => {
        outcomes.push(outcome);
        if (fail) throw new Error("db unavailable");
        return true;
      },
    },
  };
}
test("notification dispatch disabled by default and refuses production/external transport", async () => {
  assert.equal((await dispatchPreviewNotifications({})).enabled, false);
  await assert.rejects(
    dispatchPreviewNotifications({
      enabled: true,
      mode: "production",
      sink: createMemoryMailSink(),
    }),
  );
  await assert.rejects(
    dispatchPreviewNotifications({
      enabled: true,
      mode: "fictional_preview",
      sink: { kind: "email_provider" },
    }),
  );
});
test("preview sink receives least PII and idempotently records simulated delivery", async () => {
  const f = fixture(),
    sink = createMemoryMailSink();
  const args = {
    mode: "fictional_preview",
    enabled: true,
    store: f.store,
    sink,
    origin: "https://preview.example.test",
  };
  const r = await dispatchPreviewNotifications(args);
  assert.equal(r.simulated, 1);
  assert.deepEqual(f.outcomes, ["simulated"]);
  const message = [...sink.messages.values()][0];
  assert.equal(message.to, "agent@example.test");
  assert.ok(!JSON.stringify(message).includes("DO NOT COPY"));
  assert.equal(message.subject, "Fictional preview: a lead is available");
  await dispatchPreviewNotifications(args);
  assert.equal(sink.messages.size, 1);
});
test("revoked/DNC recipient is suppressed before sink is called", async () => {
  const f = fixture({ recipient: false }),
    sink = createMemoryMailSink();
  const r = await dispatchPreviewNotifications({
    mode: "fictional_preview",
    enabled: true,
    store: f.store,
    sink,
    origin: "https://preview.example.test",
  });
  assert.equal(r.suppressed, 1);
  assert.equal(sink.messages.size, 0);
  assert.deepEqual(f.outcomes, ["suppressed"]);
});
test("sink failure schedules bounded database retry without logging provider error", async () => {
  const f = fixture();
  const r = await dispatchPreviewNotifications({
    mode: "fictional_preview",
    enabled: true,
    store: f.store,
    sink: {
      kind: "memory_sink",
      deliver: async () => {
        throw new Error("private provider data");
      },
    },
    origin: "https://preview.example.test",
  });
  assert.equal(r.retrying, 1);
  assert.deepEqual(f.outcomes, ["retry"]);
});
test("lost acknowledgement is uncertain, never claimed sent", async () => {
  const f = fixture({ fail: true });
  const r = await dispatchPreviewNotifications({
    mode: "fictional_preview",
    enabled: true,
    store: f.store,
    sink: createMemoryMailSink(),
    origin: "https://preview.example.test",
  });
  assert.equal(r.uncertain, 1);
  assert.equal(r.simulated, 0);
  assert.equal(Object.hasOwn(r, "sent"), false);
});
