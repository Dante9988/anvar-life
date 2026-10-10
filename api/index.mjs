import {
  config,
  requireConfig,
  HttpError,
  CONSENT,
  PRODUCTS,
} from "../server/config.mjs";
import { json, body, origin, csrf } from "../server/http.mjs";
import {
  startLogin,
  finishLogin,
  authenticated,
  admin,
  logout,
} from "../server/auth.mjs";
import { submit } from "../server/intake.mjs";
import { UUID, only, leadPatch, STATUSES } from "../server/validation.mjs";
function checked(result) {
  if (result.error) {
    const code = result.error.code;
    if (code === "42501")
      throw new HttpError(404, "NOT_FOUND", "The record was not found.");
    if (code === "40001")
      throw new HttpError(
        409,
        "OWNERSHIP_CONFLICT",
        "The lead assignment changed. Refresh and try again.",
      );
    if (code === "23505")
      throw new HttpError(
        409,
        "CONFLICT",
        "A matching pending record already exists.",
      );
    if (code === "22023" || code === "23514")
      throw new HttpError(
        422,
        "INELIGIBLE",
        result.error.message === "CARRIER_UNVERIFIED"
          ? "The carrier has not been verified. Assignment is blocked."
          : "The requested change is invalid or the agent is not verified as eligible.",
      );
    throw new HttpError(
      503,
      "DATABASE_UNAVAILABLE",
      "The operation could not be confirmed. Try again.",
    );
  }
  return result.data;
}
function id(value) {
  if (!UUID.test(value || ""))
    throw new HttpError(400, "VALIDATION", "Invalid identifier.");
  return value;
}
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  const c = config();
  try {
    const url = new URL(req.url, "http://internal"),
      path = (
        url.pathname === "/api/index" && url.searchParams.has("route")
          ? "/api/" + url.searchParams.get("route")
          : url.pathname
      ).replace(/\/$/, "");
    const method = req.method;
    if (path === "/api/config" && method === "GET")
      return json(res, 200, {
        configured: c.configured,
        mode: c.mode,
        intakeEnabled: c.intakeEnabled,
        consent: CONSENT,
        products: PRODUCTS,
      });
    requireConfig(c);
    if (path === "/api/intake" && method === "POST") {
      origin(req, c);
      const result = await submit(req, c, await body(req));
      return json(res, result.replayed ? 200 : 201, {
        accepted: true,
        receipt: result.receipt,
        appointmentRequested: result.appointmentRequested,
      });
    }
    if (path === "/api/auth/google" && method === "GET")
      return await startLogin(req, res, c);
    if (path === "/api/auth/callback" && method === "GET")
      return await finishLogin(req, res, c, url);
    if (path === "/api/auth/logout" && method === "POST") {
      csrf(req, c);
      const result = await logout(req, res, c);
      return json(res, 200, result);
    }
    if (!path.startsWith("/api/admin/"))
      throw new HttpError(404, "NOT_FOUND", "Endpoint not found.");
    const a = await authenticated(req, res, c);
    if (!["GET", "HEAD"].includes(method)) csrf(req, c);
    if (path === "/api/admin/session" && method === "GET")
      return json(res, 200, {
        authenticated: true,
        user: a.user,
        csrfToken: a.csrfToken,
        mode: c.mode,
      });
    if (path === "/api/admin/leads" && method === "GET") {
      const page = Number(url.searchParams.get("page") || 1);
      if (!Number.isSafeInteger(page) || page < 1 || page > 10000)
        throw new HttpError(400, "VALIDATION", "Invalid page.");
      let q = a.sdk
        .from("leads")
        .select("*", { count: "exact" })
        .eq("agency_id", c.agencyId);
      for (const f of ["status", "product", "state"]) {
        const val = url.searchParams.get(f);
        if (val) {
          if (val.length > 40 || !/^[a-zA-Z_]+$/.test(val))
            throw new HttpError(400, "VALIDATION", "Invalid filter.");
          q = q.eq(f, val);
        }
      }
      const search = url.searchParams.get("search");
      if (search) {
        if (search.length > 100)
          throw new HttpError(400, "VALIDATION", "Search is too long.");
        q = q.ilike("name", `%${search.replace(/[\\%_]/g, "\\$&")}%`);
      }
      const result = await q
        .order("created_at", { ascending: false })
        .range((page - 1) * 25, page * 25 - 1);
      return json(res, 200, {
        leads: checked(result),
        page,
        pageSize: 25,
        total: result.count,
      });
    }
    if (path === "/api/admin/metrics" && method === "GET") {
      const rows = [];
      for (let offset = 0; ; offset += 1000) {
        const part = checked(
          await a.sdk
            .from("leads")
            .select(
              "id,status,assigned_to,intent,follow_up_at,do_not_contact,source_path,utm",
            )
            .eq("agency_id", c.agencyId)
            .order("id")
            .range(offset, offset + 999),
        );
        rows.push(...part);
        if (part.length < 1000) break;
        if (offset >= 99000)
          throw new HttpError(
            503,
            "METRICS_LIMIT",
            "Metrics require a database aggregation upgrade.",
          );
      }
      const metric = {
        total: rows.length,
        new: 0,
        contacted: 0,
        qualified: 0,
        application: 0,
        sold: 0,
        closed: 0,
        archived: 0,
        unassigned: 0,
        followUpDue: 0,
        appointmentRequested: 0,
        bySource: Object.create(null),
        byCampaign: Object.create(null),
        byAgent: Object.create(null),
      };
      for (const l of rows) {
        metric[l.status]++;
        if (!l.assigned_to) metric.unassigned++;
        if (l.intent === "appointment") metric.appointmentRequested++;
        if (
          l.follow_up_at &&
          !l.do_not_contact &&
          Date.parse(l.follow_up_at) <= Date.now() &&
          !["closed", "archived", "sold"].includes(l.status)
        )
          metric.followUpDue++;
        for (const [k, v] of [
          ["bySource", l.utm?.source || l.source_path || "unknown"],
          ["byCampaign", l.utm?.campaign || "none"],
          ["byAgent", l.assigned_to || "unassigned"],
        ])
          metric[k][v] = (Object.hasOwn(metric[k], v) ? metric[k][v] : 0) + 1;
      }
      return json(res, 200, metric);
    }
    if (path === "/api/admin/users" && method === "GET") {
      admin(a);
      const users = checked(
        await a.sdk
          .from("memberships")
          .select("user_id,email,role,status,verified")
          .eq("agency_id", c.agencyId),
      );
      const eligibility = checked(
        await a.sdk
          .from("agent_eligibility")
          .select("*")
          .eq("agency_id", c.agencyId),
      );
      return json(res, 200, {
        users: users.map((u) => ({
          ...u,
          eligibility: eligibility.filter((e) => e.user_id === u.user_id),
        })),
      });
    }
    if (path === "/api/admin/invites" && method === "POST") {
      admin(a);
      const p = await body(req);
      only(p, ["email", "role"]);
      if (
        typeof p.email !== "string" ||
        p.email.length > 254 ||
        !/^\S+@\S+\.\S+$/.test(p.email) ||
        !["admin", "agent"].includes(p.role)
      )
        throw new HttpError(400, "VALIDATION", "Enter a valid email and role.");
      const invitation = checked(
        await a.sdk.rpc("create_invitation", {
          p_agency: c.agencyId,
          p_email: p.email,
          p_role: p.role,
        }),
      );
      return json(res, 201, { invitation, delivery: "not_sent" });
    }
    if (path === "/api/admin/settings" && method === "GET") {
      admin(a);
      const agency = checked(
        await a.sdk
          .from("agencies")
          .select("id,name")
          .eq("id", c.agencyId)
          .single(),
      );
      return json(res, 200, {
        agency,
        mode: c.mode,
        notifications: { enabled: false },
        retention: { status: "approval_required" },
      });
    }
    const match = path.match(
      /^\/api\/admin\/leads\/([^/]+)(?:\/(assign|notes))?$/,
    );
    if (match) {
      const leadId = id(match[1]);
      if (method !== "GET") {
        const permitted = checked(
          await a.sdk
            .from("leads")
            .select("id")
            .eq("agency_id", c.agencyId)
            .eq("id", leadId)
            .maybeSingle(),
        );
        if (!permitted)
          throw new HttpError(404, "NOT_FOUND", "The record was not found.");
      }
      if (!match[2] && method === "GET") {
        const result = await a.sdk
          .from("leads")
          .select("*")
          .eq("agency_id", c.agencyId)
          .eq("id", leadId)
          .maybeSingle();
        const lead = checked(result);
        if (!lead)
          throw new HttpError(404, "NOT_FOUND", "The record was not found.");
        const events = checked(
          await a.sdk
            .from("lead_events")
            .select("*")
            .eq("agency_id", c.agencyId)
            .eq("lead_id", leadId)
            .order("created_at", { ascending: false })
            .limit(200),
        );
        const consents = checked(
          await a.sdk
            .from("consent_events")
            .select("*")
            .eq("agency_id", c.agencyId)
            .eq("lead_id", leadId),
        );
        return json(res, 200, { lead, events, consents });
      }
      if (!match[2] && method === "PATCH") {
        const p = leadPatch(await body(req));
        const lead = checked(
          await a.sdk.rpc("update_lead", { p_lead: leadId, p_patch: p }),
        );
        return json(res, 200, { lead });
      }
      if (match[2] === "notes" && method === "POST") {
        const p = await body(req);
        only(p, ["body"]);
        if (
          typeof p.body !== "string" ||
          !p.body.trim() ||
          p.body.length > 2000
        )
          throw new HttpError(
            400,
            "VALIDATION",
            "Write a note of 1–2,000 characters.",
          );
        const event = checked(
          await a.sdk.rpc("add_lead_note", {
            p_lead: leadId,
            p_body: p.body.trim(),
          }),
        );
        return json(res, 201, { event });
      }
      if (match[2] === "assign" && method === "POST") {
        admin(a);
        const p = await body(req);
        only(p, ["agentId", "expectedAssignee", "reason"]);
        id(p.agentId);
        if (p.expectedAssignee !== null) id(p.expectedAssignee);
        if (
          typeof p.reason !== "string" ||
          p.reason.trim().length < 3 ||
          p.reason.length > 500
        )
          throw new HttpError(
            400,
            "VALIDATION",
            "Explain the assignment reason.",
          );
        const lead = checked(
          await a.sdk.rpc("assign_lead", {
            p_lead: leadId,
            p_agent: p.agentId,
            p_expected: p.expectedAssignee,
            p_reason: p.reason.trim(),
          }),
        );
        return json(res, 200, { lead });
      }
    }
    throw new HttpError(404, "NOT_FOUND", "Endpoint not found.");
  } catch (e) {
    if (e instanceof HttpError)
      return json(res, e.status, {
        error: {
          code: e.code,
          message: e.message,
          ...(e.fields ? { fields: e.fields } : {}),
        },
      });
    console.error(
      JSON.stringify({ event: "api_failure", type: e?.name || "Error" }),
    );
    return json(res, 503, {
      error: {
        code: "UNAVAILABLE",
        message:
          "The service is temporarily unavailable. Your change has not been confirmed.",
      },
    });
  }
}
