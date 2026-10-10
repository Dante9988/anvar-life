import { createHash, createHmac } from "node:crypto";
import pg from "pg";
import { HttpError, CONSENT } from "./config.mjs";
import { intake, UUID } from "./validation.mjs";
export const INTAKE_ROLE_CHECK_SQL =
  "select r.rolsuper,r.rolbypassrls,exists(select 1 from pg_class t join pg_namespace n on n.oid=t.relnamespace where n.nspname='public' and t.relkind in ('r','p','v','m','f') and (t.relowner=r.oid or has_table_privilege(current_user,t.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))) as can_access_tables from pg_roles r where r.rolname=current_user";
let pool;
export function database(c) {
  if (!pool)
    pool = new pg.Pool({
      connectionString: c.databaseUrl,
      max: 3,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
      statement_timeout: 8000,
      query_timeout: 10000,
      ssl: ["localhost", "127.0.0.1", "[::1]"].includes(
        new URL(c.databaseUrl).hostname,
      )
        ? false
        : { rejectUnauthorized: true },
    });
  return pool;
}
export async function submit(req, c, input) {
  if (!c.intakeEnabled)
    throw new HttpError(
      503,
      "NOT_CONFIGURED",
      "Fictional lead intake is not available yet.",
    );
  const key = req.headers["idempotency-key"];
  if (!UUID.test(key || ""))
    throw new HttpError(
      400,
      "IDEMPOTENCY_REQUIRED",
      "A valid submission identifier is required.",
    );
  const payload = intake(input);
  if (c.turnstileSecret) {
    if (
      typeof input.challengeToken !== "string" ||
      input.challengeToken.length > 2048
    )
      throw new HttpError(
        403,
        "CHALLENGE_REQUIRED",
        "Complete the security check.",
      );
    let result;
    try {
      const response = await fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          method: "POST",
          body: new URLSearchParams({
            secret: c.turnstileSecret,
            response: input.challengeToken,
          }),
          signal: AbortSignal.timeout(6000),
        },
      );
      result = await response.json();
    } catch {
      throw new HttpError(
        503,
        "CHALLENGE_UNAVAILABLE",
        "The security check is temporarily unavailable.",
      );
    }
    if (
      !result.success ||
      result.hostname !== new URL(c.origin).hostname ||
      result.action !== "lead_intake"
    )
      throw new HttpError(
        403,
        "CHALLENGE_REJECTED",
        "The security check did not pass.",
      );
  }
  // Vercel overwrites x-vercel-forwarded-for; never trust arbitrary x-forwarded-for.
  const ip = process.env.VERCEL
    ? String(req.headers["x-vercel-forwarded-for"] || "unknown")
        .split(",")[0]
        .trim()
    : req.socket?.remoteAddress || "local";
  const bucket = createHmac("sha256", c.hashSecret)
    .update(`intake:${c.agencyId}:${ip}`)
    .digest("hex");
  const hash = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
  try {
    const runtime = await database(c).query(INTAKE_ROLE_CHECK_SQL);
    if (
      !runtime.rows[0] ||
      runtime.rows[0].rolsuper ||
      runtime.rows[0].rolbypassrls ||
      runtime.rows[0].can_access_tables
    )
      throw new Error("Unsafe intake role");
    const result = await database(c).query(
      "select public.submit_intake($1,$2,$3,$4,$5::jsonb,$6,$7) as result",
      [
        c.agencyId,
        key,
        hash,
        bucket,
        JSON.stringify(payload),
        CONSENT.contactText,
        CONSENT.marketingText,
      ],
    );
    return {
      ...result.rows[0].result,
      appointmentRequested: payload.intent === "appointment",
    };
  } catch (e) {
    if (e.code === "23505")
      throw new HttpError(
        409,
        "IDEMPOTENCY_CONFLICT",
        "This submission identifier was already used for different information.",
      );
    if (e.code === "54000")
      throw new HttpError(
        429,
        "RATE_LIMITED",
        "Too many requests. Please wait before trying again.",
      );
    throw new HttpError(
      503,
      "INTAKE_UNAVAILABLE",
      "Your request has not been confirmed. Please try again.",
    );
  }
}
