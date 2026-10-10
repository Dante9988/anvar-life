import { test } from "@playwright/test";
import assert from "node:assert/strict";

// API mocks are exclusively fictional and exist only in this test file.
test("private dashboard browser states and mutations with fictional API fixtures", async ({
  browser,
  baseURL,
}) => {
  const base = baseURL;
  const fixture = {
    id: "fictional-lead",
    name: "Fictional Preview Person",
    email: "fictional@example.invalid",
    phone: "202-555-0100",
    state: "TX",
    product: "term_life",
    intent: "appointment",
    status: "new",
    assigned_to: null,
    created_at: "2026-10-10T08:00:00Z",
    utm: { source: "fictional-test", campaign: "test-only" },
    source_path: "/",
    do_not_contact: false,
  };
  const metrics = {
    total: 1,
    new: 1,
    followUpDue: 0,
    appointmentRequested: 1,
    application: 0,
    sold: 0,
    qualified: 0,
    unassigned: 1,
    bySource: { "fictional-test": 1 },
    byCampaign: { "test-only": 1 },
    byAgent: { unassigned: 1 },
  };
  let role = "owner",
    sessionStatus = 200,
    mutationStatus = 200;
  const mutations = [];
  async function setup() {
    const page = await browser.newPage();
    await page.route("**/api/**", async (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        path = url.pathname;
      let body = {},
        status = 200;
      if (path === "/api/admin/session") {
        status = sessionStatus;
        body =
          status === 200
            ? {
                authenticated: true,
                user: {
                  id: "fictional-owner",
                  email: "owner@example.invalid",
                  role,
                  agencyId: "fictional-agency",
                },
                csrfToken: "test-csrf",
                mode: "fictional_preview",
              }
            : {
                error: {
                  code: "UNAUTHENTICATED",
                  message:
                    status === 503
                      ? "Workspace infrastructure is not configured."
                      : "Sign in required.",
                },
              };
      } else if (req.method() !== "GET") {
        mutations.push({
          path,
          body: req.postDataJSON(),
          csrf: req.headers()["x-csrf-token"],
        });
        status = mutationStatus;
        body =
          status === 200
            ? path.endsWith("/invites")
              ? {
                  invitation: { email: req.postDataJSON().email },
                  delivery: "not_sent",
                }
              : { lead: fixture }
            : { error: { code: "ERROR", message: "Save rejected by server." } };
      } else if (path === "/api/admin/leads")
        body = { leads: [fixture], total: 1, page: 1, pageSize: 25 };
      else if (path === "/api/admin/metrics") body = metrics;
      else if (path.endsWith("/fictional-lead"))
        body = {
          lead: fixture,
          consents: [
            {
              version: "test-only",
              contact: true,
              contact_text: "Fictional test consent",
              created_at: fixture.created_at,
            },
          ],
          events: [
            {
              event: "note_added",
              detail: { body: "Fictional follow-up note" },
              created_at: fixture.created_at,
            },
          ],
        };
      else if (path === "/api/admin/users") body = { users: [] };
      else if (path === "/api/admin/settings")
        body = {
          agency: { name: "Fictional Agency" },
          mode: "fictional_preview",
          notifications: { enabled: false },
          retention: { status: "approval_required" },
        };
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });
    return page;
  }
  await test.step("unauthenticated and infrastructure-unavailable pages contain no client records", async () => {
    sessionStatus = 401;
    let page = await setup();
    await page.goto(base + "/admin/leads");
    await page
      .getByRole("heading", { name: "A secure space for your team" })
      .waitFor();
    assert.equal(await page.getByText(fixture.name).count(), 0);
    assert.equal(
      await page
        .getByRole("link", { name: /Continue with Google/ })
        .getAttribute("href"),
      "/api/auth/google",
    );
    await page.close();
    sessionStatus = 503;
    page = await setup();
    await page.goto(base + "/admin/leads");
    await page
      .getByRole("heading", { name: "Workspace not connected" })
      .waitFor();
    assert.equal(await page.getByText(fixture.name).count(), 0);
    await page.close();
    sessionStatus = 200;
  });
  await test.step("owner sees records, metrics, consent and failed saves do not claim success", async () => {
    const page = await setup();
    await page.goto(base + "/admin/leads");
    await page.getByRole("button", { name: fixture.name }).click();
    await page.getByText("Fictional test consent").waitFor();
    await page.getByText("Fictional follow-up note").waitFor();
    await page
      .getByLabel("Lead status", { exact: true })
      .selectOption("application");
    mutationStatus = 422;
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.getByText("Save rejected by server.").waitFor();
    assert.equal(await page.getByText("Lead changes saved.").count(), 0);
    assert.equal(mutations.at(-1).csrf, "test-csrf");
    assert.equal(mutations.at(-1).body.status, "application");
    mutationStatus = 200;
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.getByText("Lead changes saved.").waitFor();
    await page.getByRole("button", { name: "Close lead" }).click();
    await page.getByRole("button", { name: "Team & access" }).click();
    await page
      .getByLabel("Google Workspace email")
      .fill("fictional-agent@example.invalid");
    await page
      .getByRole("button", { name: "Create pending invitation" })
      .click();
    await page.getByText(/No email was sent/).waitFor();
    await page.close();
  });
  await test.step("agent cannot see owner navigation; unsupported manager role denied", async () => {
    role = "agent";
    let page = await setup();
    await page.goto(base + "/admin/leads");
    await page
      .getByRole("heading", { name: "Lead workspace", exact: true })
      .waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Team & access" }).count(),
      0,
    );
    await page.getByRole("button", { name: fixture.name }).click();
    assert.equal(
      await page.getByRole("button", { name: "Review eligible team" }).count(),
      0,
    );
    await page.close();
    role = "manager";
    page = await setup();
    await page.goto(base + "/admin/leads");
    await page.getByRole("heading", { name: "Access is restricted" }).waitFor();
    assert.equal(await page.getByText(fixture.name).count(), 0);
    await page.close();
    role = "owner";
  });
  await test.step("mobile viewport has no page overflow and logout removes client data", async () => {
    const page = await setup();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + "/admin/leads");
    await page.getByRole("button", { name: fixture.name }).waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page
      .getByRole("heading", { name: "A secure space for your team" })
      .waitFor();
    assert.equal(await page.getByText(fixture.name).count(), 0);
    assert.equal(
      await page.evaluate(() => localStorage.length + sessionStorage.length),
      0,
    );
    await page.close();
  });

  await test.step("closing a lead ignores its delayed response", async () => {
    const page = await setup();
    let pending;
    await page.route("**/api/admin/leads/fictional-lead", (route) => {
      pending = route;
    });
    await page.goto(base + "/admin/leads");
    await page.getByRole("button", { name: fixture.name }).click();
    await page.getByRole("heading", { name: "Loading lead" }).waitFor();
    await page.getByRole("button", { name: "Close lead" }).click();
    if (pending)
      await pending.fulfill({
        json: { lead: fixture, consents: [], events: [] },
      });
    assert.equal(
      await page.locator("#lead-dialog").evaluate((el) => el.open),
      false,
    );
    assert.equal(await page.locator("#detail").textContent(), "");
    await page.close();
  });
  await test.step("session expiry clears previously rendered client data", async () => {
    const page = await setup();
    await page.goto(base + "/admin/leads");
    await page.getByRole("button", { name: fixture.name }).waitFor();
    await page.route("**/api/admin/leads?**", (route) =>
      route.fulfill({
        status: 401,
        json: { error: { message: "Session expired." } },
      }),
    );
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await page
      .getByText("Your session has expired. Sign in again to continue.")
      .waitFor();
    assert.equal(await page.getByText(fixture.name).count(), 0);
    await page.close();
  });
  await test.step("stalled reads recover with a bounded timeout", async () => {
    const page = await setup();
    await page.clock.install();
    let pending;
    await page.route("**/api/admin/metrics", (route) => {
      pending = route;
    });
    await page.goto(base + "/admin/leads");
    await page.getByRole("heading", { name: "Loading your leads" }).waitFor();
    await page.clock.fastForward(16000);
    await page
      .getByRole("heading", { name: "We couldn’t load this view" })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Try again", exact: true })
        .count(),
      1,
    );
    if (pending) await pending.abort().catch(() => {});
    await page.close();
  });
});
