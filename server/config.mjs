export const CONSENT = Object.freeze({
  version: "2026-10-10.v1",
  contactText:
    "I ask Benefits with Veterans to contact me about this request using the phone number or email I provide, through my preferred method. This consent is required to submit my request.",
  marketingText:
    "Optional: I agree to receive automated marketing calls and texts from Benefits with Veterans at the number I provide, including through an autodialer or prerecorded/artificial voice. Consent is not a condition of purchase. Message and data rates may apply; frequency varies. Reply STOP to opt out of texts.",
});
export const PRODUCTS = Object.freeze([
  { value: "term_life", label: "Term life" },
  { value: "whole_life", label: "Whole life" },
  { value: "final_expense", label: "Final expense" },
  { value: "mortgage_protection", label: "Mortgage protection" },
  { value: "retirement", label: "Long-term planning" },
  { value: "veteran_benefits", label: "Veteran coverage questions" },
  { value: "unsure", label: "Not sure yet" },
]);
export class HttpError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    Object.assign(this, { status, code, fields });
  }
}
export function config(env = process.env) {
  let origin;
  try {
    origin = new URL(env.APP_ORIGIN);
    if (
      origin.origin !== env.APP_ORIGIN ||
      !["https:", "http:"].includes(origin.protocol) ||
      (origin.protocol === "http:" &&
        !["localhost", "127.0.0.1"].includes(origin.hostname))
    )
      origin = null;
  } catch {}
  const mode =
    env.APP_MODE === "fictional_preview" ? "fictional_preview" : "disabled";
  const configured = !!(
    origin &&
    env.SUPABASE_URL &&
    env.SUPABASE_PUBLISHABLE_KEY &&
    env.AGENCY_ID &&
    env.INTAKE_HASH_SECRET?.length >= 32
  );
  return {
    origin: origin?.origin,
    secure: origin?.protocol === "https:",
    mode,
    configured,
    intakeEnabled:
      configured &&
      mode === "fictional_preview" &&
      env.INTAKE_ENABLED === "true" &&
      !!env.INTAKE_DATABASE_URL &&
      !env.TURNSTILE_SECRET_KEY,
    supabaseUrl: env.SUPABASE_URL,
    key: env.SUPABASE_PUBLISHABLE_KEY,
    agencyId: env.AGENCY_ID,
    databaseUrl: env.INTAKE_DATABASE_URL,
    hashSecret: env.INTAKE_HASH_SECRET,
    turnstileSecret: env.TURNSTILE_SECRET_KEY,
  };
}
export function requireConfig(c) {
  if (!c.configured || c.mode === "disabled")
    throw new HttpError(
      503,
      "NOT_CONFIGURED",
      "The private preview is not configured yet.",
    );
}
