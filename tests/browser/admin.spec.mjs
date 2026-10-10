import { test, expect } from "@playwright/test";

// Fictional, test-only API fixtures. Never imported by the application.
const leadId = "10000000-0000-4000-8000-000000000001";
const fixture = {
  id: leadId,
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
const record = {
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
      event: "note",
      detail: { body: "Fictional follow-up note" },
      created_at: fixture.created_at,
    },
  ],
};
async function setup(page, overrides = {}) {
  const control = {
    role: "owner",
    sessionStatus: 200,
    mutationStatus: 200,
    mutations: [],
    reads: [],
    ...overrides,
  };
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    let body = {},
      status = 200;
    if (path === "/api/admin/session") {
      status = control.sessionStatus;
      body =
        status === 200
          ? {
              authenticated: true,
              user: {
                id: "fictional-owner",
                email: "owner@example.invalid",
                role: control.role,
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
    } else if (request.method() !== "GET") {
      control.mutations.push({
        path,
        body: request.postDataJSON(),
        csrf: request.headers()["x-csrf-token"],
      });
      status = control.mutationStatus;
      body =
        status === 200
          ? path.endsWith("/invites")
            ? {
                invitation: { email: request.postDataJSON().email },
                delivery: "not_sent",
              }
            : { lead: fixture }
          : { error: { code: "ERROR", message: "Save rejected by server." } };
    } else {
      control.reads.push(path);
      if (path === "/api/admin/leads")
        body = { leads: [fixture], total: 1, page: 1, pageSize: 25 };
      else if (path === "/api/admin/metrics") body = metrics;
      else if (path === `/api/admin/leads/${leadId}`) body = record;
      else if (path === "/api/admin/users") body = { users: [] };
      else if (path === "/api/admin/settings")
        body = {
          agency: { name: "Fictional Agency" },
          mode: "fictional_preview",
          notifications: { enabled: false },
          retention: { status: "approval_required" },
        };
    }
    await route.fulfill({ status, json: body });
  });
  return control;
}

for (const [status, title] of [
  [401, "A secure space for your team"],
  [503, "Workspace not connected"],
]) {
  test(`admin ${status} contains no client records`, async ({ page }) => {
    await setup(page, { sessionStatus: status });
    await page.goto("/admin/leads");
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByText(fixture.name)).toHaveCount(0);
    if (status === 401)
      await expect(
        page.getByRole("link", { name: /Continue with Google/ }),
      ).toHaveAttribute("href", "/api/auth/google");
  });
}

test("owner sees consent and activity; rejected mutation cannot claim success", async ({
  page,
}) => {
  const control = await setup(page);
  await page.goto("/admin/leads");
  await page.getByRole("button", { name: fixture.name }).click();
  await expect(page.getByText("Fictional test consent")).toBeVisible();
  await expect(page.getByText("Fictional follow-up note")).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Lead status", exact: true }),
  ).toHaveCount(1);
  await page
    .getByLabel("Lead status", { exact: true })
    .selectOption("application");
  control.mutationStatus = 422;
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Save rejected by server.")).toBeVisible();
  await expect(page.getByText("Lead changes saved.")).toHaveCount(0);
  expect(control.mutations.at(-1).csrf).toBe("test-csrf");
  expect(control.mutations.at(-1).body.status).toBe("application");
  control.mutationStatus = 200;
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator("#notice")).toContainText("Lead changes saved.");
});

test("pending invitation explicitly reports that no email was sent", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/admin/leads");
  await page.getByRole("button", { name: "Team & access" }).click();
  await page
    .getByLabel("Google Workspace email")
    .fill("fictional-agent@example.invalid");
  await page.getByRole("button", { name: "Create pending invitation" }).click();
  await expect(page.getByText(/No email was sent/)).toBeVisible();
});

test("agent sees only assigned-lead UI and no owner controls", async ({
  page,
}) => {
  await setup(page, { role: "agent" });
  await page.goto("/admin/leads");
  await expect(
    page.getByRole("heading", { name: "Lead workspace", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Team & access" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: fixture.name }).click();
  await expect(page.getByRole("heading", { name: fixture.name })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review eligible team" }),
  ).toHaveCount(0);
});

test("unsupported manager role is denied before any lead read", async ({
  page,
}) => {
  const control = await setup(page, { role: "manager" });
  await page.goto("/admin/leads");
  await expect(
    page.getByRole("heading", { name: "Access is restricted" }),
  ).toBeVisible();
  await expect(page.getByText(fixture.name)).toHaveCount(0);
  expect(control.reads).toEqual([]);
});

test("responsive dashboard fits viewport; sign-out removes client data", async ({
  page,
}, info) => {
  await setup(page);
  await page.goto("/admin/leads");
  await expect(page.getByRole("button", { name: fixture.name })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const navigation = page.getByRole("navigation", { name: "Workspace" });
  for (const name of [
    "Lead workspace",
    "Performance",
    "Team & access",
    "Agency settings",
  ]) {
    await expect(
      navigation.getByRole("button", { name, exact: true }),
    ).toBeInViewport({ ratio: 1 });
  }
  expect(
    await navigation.evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("private-dashboard.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A secure space for your team" }),
  ).toBeVisible();
  await expect(page.getByText(fixture.name)).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.length + sessionStorage.length),
  ).toBe(0);
});

test("closing a lead ignores its delayed response", async ({ page }) => {
  await setup(page);
  let release;
  const intercepted = new Promise((resolve) => {
    release = resolve;
  });
  await page.route(`**/api/admin/leads/${leadId}`, (route) => release(route));
  await page.goto("/admin/leads");
  await page.getByRole("button", { name: fixture.name }).click();
  const pending = await intercepted;
  await expect(
    page.getByRole("heading", { name: "Loading lead" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close lead" }).click();
  await pending.fulfill({ json: record });
  await expect(page.locator("#lead-dialog")).not.toBeVisible();
  await expect(page.locator("#detail")).toHaveText("");
});

test("session expiry clears previously rendered client data", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/admin/leads");
  await expect(page.getByRole("button", { name: fixture.name })).toBeVisible();
  await page.route("**/api/admin/leads?**", (route) =>
    route.fulfill({
      status: 401,
      json: { error: { message: "Session expired." } },
    }),
  );
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(
    page.getByText("Your session has expired. Sign in again to continue."),
  ).toBeVisible();
  await expect(page.getByText(fixture.name)).toHaveCount(0);
});

test("stalled reads recover with a bounded timeout", async ({ page }) => {
  await setup(page);
  await page.clock.install();
  let release;
  const intercepted = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/api/admin/metrics", (route) => release(route));
  await page.goto("/admin/leads");
  const pending = await intercepted;
  await expect(
    page.getByRole("heading", { name: "Loading your leads" }),
  ).toBeVisible();
  await page.clock.fastForward(16000);
  await expect(
    page.getByRole("heading", { name: "We couldn’t load this view" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeVisible();
  await pending.abort().catch(() => {});
});

test("valid lead deep link opens only after an authorized session", async ({
  page,
}) => {
  const control = await setup(page);
  await page.goto(`/admin/leads?lead=${leadId}`);
  await expect(page.getByRole("heading", { name: fixture.name })).toBeVisible();
  expect(control.reads).toContain(`/api/admin/leads/${leadId}`);
});

test("invalid lead parameter is ignored and unauthenticated links never fetch detail", async ({
  page,
}) => {
  const control = await setup(page, { sessionStatus: 401 });
  await page.goto(`/admin/leads?lead=${leadId}`);
  await expect(
    page.getByRole("heading", { name: "A secure space for your team" }),
  ).toBeVisible();
  expect(control.reads).toEqual([]);
  control.sessionStatus = 200;
  await page.goto("/admin/leads?lead=not-a-valid-uuid");
  await expect(page.getByRole("button", { name: fixture.name })).toBeVisible();
  await expect(page.locator("#lead-dialog")).not.toBeVisible();
  expect(control.reads).not.toContain(`/api/admin/leads/${leadId}`);
});

test("local logout clears data and warns when remote revocation is unconfirmed", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/admin/leads");
  await expect(page.getByRole("button", { name: fixture.name })).toBeVisible();
  await page.route("**/api/auth/logout", (route) =>
    route.fulfill({
      json: { localSignedOut: true, remoteRevocationConfirmed: false },
    }),
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByText(
      /This browser is signed out, but remote session revocation could not be confirmed/,
    ),
  ).toBeVisible();
  await expect(page.getByText(fixture.name)).toHaveCount(0);
});
