import { timingSafeEqual } from "node:crypto";
import { HttpError } from "./config.mjs";
export function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(data));
}
export function cookies(req) {
  const out = {};
  for (const pair of (req.headers.cookie || "").split(";")) {
    const i = pair.indexOf("=");
    if (i > 0) {
      try {
        out[pair.slice(0, i).trim()] = decodeURIComponent(pair.slice(i + 1));
      } catch {}
    }
  }
  return out;
}
export function cookieName(c, name) {
  return `${c.secure ? "__Host-" : ""}agency-${name}`;
}
export function setCookie(res, c, name, value, age = 3600) {
  const line = `${cookieName(c, name)}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${c.secure ? "; Secure" : ""}`;
  const previous = res.getHeader("Set-Cookie") || [];
  res.setHeader("Set-Cookie", [
    ...(Array.isArray(previous) ? previous : [previous]),
    line,
  ]);
}
export function cookie(req, c, name) {
  return cookies(req)[cookieName(c, name)];
}
export function equal(a, b) {
  return (
    typeof a === "string" &&
    typeof b === "string" &&
    Buffer.byteLength(a) === Buffer.byteLength(b) &&
    timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}
export function origin(req, c) {
  if (req.headers.origin !== c.origin)
    throw new HttpError(
      403,
      "ORIGIN_REJECTED",
      "This request must come from the preview website.",
    );
}
export function csrf(req, c) {
  origin(req, c);
  if (!equal(req.headers["x-csrf-token"], cookie(req, c, "csrf")))
    throw new HttpError(
      403,
      "CSRF_REJECTED",
      "Refresh the page and try again.",
    );
}
export async function body(req) {
  if (
    (req.headers["content-type"] || "").toLowerCase().split(";")[0].trim() !==
    "application/json"
  )
    throw new HttpError(415, "CONTENT_TYPE", "Send JSON.");
  let data = "";
  if (req.body !== undefined) {
    data = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  } else {
    for await (const chunk of req) {
      data += chunk;
      if (Buffer.byteLength(data) > 16384)
        throw new HttpError(
          413,
          "BODY_TOO_LARGE",
          "The submission is too large.",
        );
    }
  }
  if (Buffer.byteLength(data) > 16384)
    throw new HttpError(413, "BODY_TOO_LARGE", "The submission is too large.");
  try {
    return JSON.parse(data);
  } catch {
    throw new HttpError(400, "INVALID_JSON", "Invalid JSON.");
  }
}
