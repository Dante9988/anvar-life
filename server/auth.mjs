import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { HttpError } from "./config.mjs";
import { cookie, setCookie } from "./http.mjs";
const boundedFetch = (input, init = {}) =>
  fetch(input, {
    ...init,
    signal: init.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(8000)])
      : AbortSignal.timeout(8000),
  });
const options = {
  autoRefreshToken: false,
  persistSession: false,
  detectSessionInUrl: false,
};
export function client(c, token) {
  return createClient(c.supabaseUrl, c.key, {
    auth: options,
    global: {
      fetch: boundedFetch,
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    },
  });
}
function sessionCookies(res, c, s) {
  setCookie(res, c, "access", s.access_token, s.expires_in || 3600);
  setCookie(res, c, "refresh", s.refresh_token, 86400);
}
export async function startLogin(req, res, c) {
  const store = new Map();
  const sdk = createClient(c.supabaseUrl, c.key, {
    global: { fetch: boundedFetch },
    auth: {
      ...options,
      flowType: "pkce",
      persistSession: true,
      storage: {
        getItem: (k) => store.get(k) || null,
        setItem: (k, v) => {
          store.set(k, v);
          if (k.endsWith("code-verifier")) setCookie(res, c, "pkce", v, 600);
        },
        removeItem: (k) => store.delete(k),
      },
    },
  });
  const { data, error } = await sdk.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${c.origin}/api/auth/callback`,
      skipBrowserRedirect: true,
      scopes: "openid email profile",
    },
  });
  if (error || !data.url)
    throw new HttpError(503, "AUTH_UNAVAILABLE", "Sign-in is not available.");
  res.statusCode = 302;
  res.setHeader("Location", data.url);
  res.end();
}
export async function finishLogin(req, res, c, url) {
  const code = url.searchParams.get("code"),
    verifier = cookie(req, c, "pkce");
  if (
    !code ||
    !verifier ||
    url.searchParams.has("next") ||
    url.searchParams.has("redirect")
  )
    throw new HttpError(400, "AUTH_CALLBACK", "Invalid sign-in callback.");
  const sdk = createClient(c.supabaseUrl, c.key, {
    global: { fetch: boundedFetch },
    auth: {
      ...options,
      flowType: "pkce",
      persistSession: true,
      storage: {
        getItem: (k) => (k.endsWith("code-verifier") ? verifier : null),
        setItem: () => {},
        removeItem: () => {},
      },
    },
  });
  const { data, error } = await sdk.auth.exchangeCodeForSession(code);
  setCookie(res, c, "pkce", "", 0);
  if (error || !data.session)
    throw new HttpError(
      401,
      "AUTH_CALLBACK",
      "Sign-in could not be completed.",
    );
  const token = data.session.access_token;
  const scoped = client(c, token);
  const { data: userData, error: userError } = await scoped.auth.getUser(token);
  if (
    userError ||
    !userData.user?.identities?.some((i) => i.provider === "google")
  )
    throw new HttpError(
      403,
      "INVITATION_REQUIRED",
      "An invited Google account is required.",
    );
  const accepted = await scoped.rpc("accept_invitation");
  if (accepted.error)
    throw new HttpError(
      403,
      "INVITATION_REQUIRED",
      "An active invitation is required.",
    );
  const member = await scoped
    .from("memberships")
    .select("agency_id,user_id,role,status")
    .eq("agency_id", c.agencyId)
    .eq("user_id", userData.user.id)
    .eq("status", "active")
    .single();
  if (member.error || !["owner", "admin", "agent"].includes(member.data?.role))
    throw new HttpError(
      403,
      "FORBIDDEN",
      "This account does not have preview access.",
    );
  sessionCookies(res, c, data.session);
  setCookie(res, c, "csrf", randomBytes(32).toString("hex"), 86400);
  res.statusCode = 302;
  res.setHeader("Location", `${c.origin}/admin/`);
  res.end();
}
export async function authenticated(req, res, c) {
  let token = cookie(req, c, "access");
  const refresh = cookie(req, c, "refresh");
  if (!token && !refresh)
    throw new HttpError(
      401,
      "UNAUTHENTICATED",
      "Sign in with your invited Google account.",
    );
  let sdk = client(c, token);
  let result = token ? await sdk.auth.getUser(token) : { error: true };
  if (result.error && refresh) {
    const refreshed = await client(c).auth.refreshSession({
      refresh_token: refresh,
    });
    if (refreshed.error || !refreshed.data.session)
      throw new HttpError(401, "UNAUTHENTICATED", "Your session has expired.");
    token = refreshed.data.session.access_token;
    sessionCookies(res, c, refreshed.data.session);
    sdk = client(c, token);
    result = await sdk.auth.getUser(token);
  }
  if (
    result.error ||
    !result.data?.user?.identities?.some((i) => i.provider === "google")
  )
    throw new HttpError(401, "UNAUTHENTICATED", "Sign in again.");
  const u = result.data.user;
  const { data: m, error } = await sdk
    .from("memberships")
    .select("agency_id,user_id,role,status")
    .eq("agency_id", c.agencyId)
    .eq("user_id", u.id)
    .eq("status", "active")
    .single();
  if (error || !m || !["owner", "admin", "agent"].includes(m.role))
    throw new HttpError(403, "FORBIDDEN", "This account does not have access.");
  let csrfToken = cookie(req, c, "csrf");
  if (!csrfToken) {
    csrfToken = randomBytes(32).toString("hex");
    setCookie(res, c, "csrf", csrfToken, 86400);
  }
  return {
    sdk,
    token,
    user: { id: u.id, email: u.email, role: m.role, agencyId: m.agency_id },
    csrfToken,
  };
}
export function admin(a) {
  if (!["owner", "admin"].includes(a.user.role))
    throw new HttpError(
      403,
      "FORBIDDEN",
      "Agency administrator access is required.",
    );
}
export async function logout(req, res, c, dependencies = {}) {
  let token = cookie(req, c, "access");
  const refresh = cookie(req, c, "refresh");
  const refreshSession =
    dependencies.refreshSession ||
    ((value) => client(c).auth.refreshSession({ refresh_token: value }));
  const revoke =
    dependencies.revoke ||
    ((value) =>
      fetch(`${c.supabaseUrl}/auth/v1/logout?scope=local`, {
        method: "POST",
        headers: { apikey: c.key, Authorization: `Bearer ${value}` },
        signal: AbortSignal.timeout(5000),
      }));
  try {
    let response = token ? await revoke(token) : null;
    if ((!token || response?.status === 401) && refresh) {
      const refreshed = await refreshSession(refresh);
      if (refreshed.error || !refreshed.data?.session?.access_token)
        throw new Error("Refresh failed");
      token = refreshed.data.session.access_token;
      response = await revoke(token);
    }
    if ((token || refresh) && !response?.ok)
      throw new Error("Revocation failed");
  } catch {
    throw new HttpError(
      503,
      "AUTH_UNAVAILABLE",
      "Session revocation is unavailable. Please try again.",
    );
  }
  for (const key of ["access", "refresh", "csrf", "pkce"])
    setCookie(res, c, key, "", 0);
}
