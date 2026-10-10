/** A transport boundary for isolated fictional testing. No external email adapter is shipped. */
export function createMemoryMailSink() {
  const messages = new Map();
  return {
    kind: "memory_sink",
    messages,
    async deliver(message) {
      // This sink deduplicates only within this process. Restart durability requires a real
      // provider idempotency contract before any external transport can be enabled.
      if (!messages.has(message.idempotencyKey)) {
        messages.set(message.idempotencyKey, structuredClone(message));
      }
      return { simulated: true };
    },
  };
}
export function createPostgresOutboxStore(db) {
  return {
    async claim(limit) {
      return (
        await db.query(
          "select public.claim_preview_notifications($1) as value",
          [limit],
        )
      ).rows[0].value;
    },
    async resolve(item) {
      return (
        await db.query(
          "select public.resolve_preview_notification($1,$2) as value",
          [item.id, item.leaseToken],
        )
      ).rows[0].value;
    },
    async finish(item, outcome) {
      return (
        await db.query(
          "select public.finish_preview_notification($1,$2,$3) as value",
          [item.id, item.leaseToken, outcome],
        )
      ).rows[0].value;
    },
  };
}
export async function dispatchPreviewNotifications({
  mode,
  enabled = false,
  store,
  sink,
  origin,
  limit = 10,
}) {
  if (!enabled)
    return {
      enabled: false,
      simulated: 0,
      suppressed: 0,
      retrying: 0,
      uncertain: 0,
    };
  if (mode !== "fictional_preview" || sink?.kind !== "memory_sink") {
    throw new Error(
      "External notification dispatch is not approved or implemented.",
    );
  }
  const trustedOrigin = new URL(origin);
  if (
    trustedOrigin.origin !== origin ||
    !["https:", "http:"].includes(trustedOrigin.protocol) ||
    (trustedOrigin.protocol === "http:" &&
      !["localhost", "127.0.0.1"].includes(trustedOrigin.hostname))
  ) {
    throw new Error("An exact trusted preview origin is required.");
  }
  const result = {
    enabled: true,
    simulated: 0,
    suppressed: 0,
    retrying: 0,
    uncertain: 0,
  };
  const items = await store.claim(limit);
  for (const item of items) {
    try {
      // Resolve immediately before delivery. The database rechecks lease, current assignment,
      // active verified recipient, fictional flag, tenant and do-not-contact preference.
      const recipient = await store.resolve(item);
      if (!recipient) {
        if (await store.finish(item, "suppressed")) result.suppressed++;
        else result.uncertain++;
        continue;
      }
      if (!/^\/admin\/leads\?lead=[0-9a-f-]{36}$/i.test(recipient.portalPath))
        throw new Error("Invalid portal path");
      const delivered = await sink.deliver({
        idempotencyKey: item.id,
        recipientId: recipient.recipientId,
        to: recipient.recipientEmail,
        subject: "Fictional preview: a lead is available",
        text: `A fictional test lead is available in your private portal: ${origin}${recipient.portalPath}`,
      });
      if (delivered?.simulated !== true)
        throw new Error("Sink did not confirm simulation");
      if (await store.finish(item, "simulated")) result.simulated++;
      else result.uncertain++;
    } catch {
      // Only a bounded error code is persisted by SQL; never store provider payload or PII.
      try {
        if (await store.finish(item, "retry")) result.retrying++;
        else result.uncertain++;
      } catch {
        result.uncertain++;
      } // Lease expires and retry can be safely claimed again.
    }
  }
  return result;
}
