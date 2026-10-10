import { HttpError, CONSENT, PRODUCTS } from "./config.mjs";
import {
  ATTRIBUTION_KEYS,
  normalizeAttribution,
} from "../dist/attribution.mjs";
export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATES = new Set(
  "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(
    " ",
  ),
);
export const STATUSES = [
  "new",
  "contacted",
  "qualified",
  "application",
  "sold",
  "closed",
  "archived",
];
export function object(v) {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new HttpError(400, "VALIDATION", "Expected a JSON object.");
  return v;
}
export function only(v, keys) {
  object(v);
  if (Object.keys(v).some((k) => !keys.includes(k)))
    throw new HttpError(400, "VALIDATION", "Unexpected field.");
}
function str(v, max, required = false) {
  if (v == null && !required) return "";
  if (
    typeof v !== "string" ||
    v.length > max ||
    /[\u0000-\u001f]/.test(v) ||
    (required && !v.trim())
  )
    throw new HttpError(400, "VALIDATION", "Check the form fields.");
  return v.trim();
}
function choice(v, choices, required = false) {
  if (v == null && !required) return null;
  if (!choices.includes(v))
    throw new HttpError(400, "VALIDATION", "Choose a supported option.");
  return v;
}
export function intake(input) {
  only(input, [
    "name",
    "email",
    "phone",
    "state",
    "product",
    "intent",
    "consent",
    "utm",
    "sourcePath",
    "website",
    "fictional",
    "challengeToken",
    "ageRange",
    "budget",
    "interest",
    "preferredContact",
  ]);
  if (input.website)
    throw new HttpError(400, "VALIDATION", "Unable to accept this submission.");
  if (input.fictional !== true)
    throw new HttpError(
      403,
      "FICTIONAL_ONLY",
      "This preview accepts fictional test information only.",
    );
  const name = str(input.name, 161, true),
    email = str(input.email, 254).toLowerCase(),
    phone = str(input.phone, 30);
  if (
    (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ||
    (phone && !/^\+?[0-9 ()-]{7,30}$/.test(phone)) ||
    (!email && !phone)
  )
    throw new HttpError(400, "VALIDATION", "Provide valid contact details.");
  if (!STATES.has(input.state))
    throw new HttpError(400, "VALIDATION", "Choose a U.S. state.");
  only(input.consent, ["contact", "marketing", "version"]);
  if (
    input.consent.contact !== true ||
    typeof input.consent.marketing !== "boolean" ||
    input.consent.version !== CONSENT.version
  )
    throw new HttpError(
      400,
      "CONSENT_REQUIRED",
      "Review and accept the current contact consent.",
    );
  let utm = {};
  if (input.utm) {
    only(input.utm, ATTRIBUTION_KEYS);
    const attribution = new URLSearchParams();
    // Revalidate untrusted API input independently of the browser. Rebuilding only
    // allowlisted keys prevents arbitrary URL parameters from entering persistence.
    for (const key of ATTRIBUTION_KEYS) {
      if (Object.hasOwn(input.utm, key)) {
        attribution.set(`utm_${key}`, str(input.utm[key], 100));
      }
    }
    utm = normalizeAttribution(attribution.toString());
  }
  return {
    name,
    email,
    phone,
    state: input.state,
    product: choice(
      input.product,
      PRODUCTS.map((p) => p.value),
      true,
    ),
    intent: choice(input.intent, ["quote", "appointment"], true),
    consent: {
      contact: true,
      marketing: input.consent.marketing,
      version: CONSENT.version,
    },
    utm,
    sourcePath: choice(
      input.sourcePath,
      ["/", "/veterans/", "/find-coverage/"],
      true,
    ),
    fictional: true,
    ageRange: choice(input.ageRange, [
      "18-39",
      "40-59",
      "60-70",
      "71-85",
      "86+",
    ]),
    budget: choice(input.budget, ["25-50", "50-100", "100-200", "200+"]),
    interest: choice(input.interest, [
      "family",
      "final_expense",
      "mortgage_income",
      "long_term",
      "unsure",
    ]),
    preferredContact: choice(input.preferredContact, ["phone", "email", "sms"]),
  };
}
export function leadPatch(v) {
  only(v, ["status", "follow_up_at", "do_not_contact"]);
  if (!Object.keys(v).length)
    throw new HttpError(400, "VALIDATION", "No changes supplied.");
  if ("status" in v) choice(v.status, STATUSES, true);
  if ("do_not_contact" in v && typeof v.do_not_contact !== "boolean")
    throw new HttpError(400, "VALIDATION", "Invalid contact preference.");
  if (
    "follow_up_at" in v &&
    v.follow_up_at !== null &&
    (typeof v.follow_up_at !== "string" ||
      !/^\d{4}-\d\d-\d\dT/.test(v.follow_up_at) ||
      !Number.isFinite(Date.parse(v.follow_up_at)))
  )
    throw new HttpError(400, "VALIDATION", "Invalid follow-up date.");
  return v;
}
