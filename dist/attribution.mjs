// Campaign attribution only. Never retain arbitrary queries, referrers or personal fields.
export const ATTRIBUTION_KEYS = Object.freeze(['source', 'medium', 'campaign', 'term', 'content']);
export function normalizeAttribution(search = '') {
  if (typeof search !== 'string' || search.length > 2048) return {};
  const params = new URLSearchParams(search);
  const result = {};
  for (const key of ATTRIBUTION_KEYS) {
    const values = params.getAll(`utm_${key}`);
    if (values.length !== 1) continue;
    const value = values[0].trim();
    if (!value || value.length > 100 || !/^[a-z0-9][a-z0-9 ._-]*$/i.test(value)) continue;
    // Reject likely contact/identity values instead of trying to redact or save them.
    if (!(key === 'medium' && value.toLowerCase() === 'email') && /email|phone|mobile|contact|social.?security|ssn|birth|dob|https?|www\./i.test(value)) continue;
    if ((value.match(/\d/g) || []).length >= 7) continue;
    if (/\b[a-z0-9._-]+\.(com|net|org|edu|gov|io)\b/i.test(value)) continue;
    result[key] = value;
  }
  return result;
}
export function questionnaireHref(attribution) {
  const params = new URLSearchParams();
  for (const key of ATTRIBUTION_KEYS) if (attribution[key]) params.set(`utm_${key}`, attribution[key]);
  const normalized = normalizeAttribution(params.toString());
  const safe = new URLSearchParams();
  for (const key of ATTRIBUTION_KEYS) if (normalized[key]) safe.set(`utm_${key}`, normalized[key]);
  return `/find-coverage/${safe.size ? `?${safe.toString()}` : ''}`;
}
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  const href = questionnaireHref(normalizeAttribution(window.location.search));
  for (const anchor of document.querySelectorAll('a[href="/find-coverage/"]')) anchor.setAttribute('href', href);
}
