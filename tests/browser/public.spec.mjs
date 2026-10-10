import { test, expect } from "@playwright/test";

const config = {
  configured: true,
  mode: "fictional_preview",
  intakeEnabled: true,
  consent: {
    version: "2026-10-10.v1",
    contactText: "Fictional test: contact me about this request.",
    marketingText: "Fictional test: optional marketing consent.",
  },
};
async function questionnaire(page) {
  await page.route("**/api/config", (route) => route.fulfill({ json: config }));
  await page.goto("/find-coverage/");
  await expect(page.locator("#coverage-form")).toBeVisible();
  await page.getByLabel("Protect my family", { exact: true }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("40–59", { exact: true }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("State of residence").selectOption("CA");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("First name", { exact: true }).fill("Fictional");
  await page.getByLabel("Last name", { exact: true }).fill("Example");
  await page.getByLabel("Phone", { exact: true }).fill("2025550142");
  await page
    .getByLabel("Email", { exact: true })
    .fill("fictional@example.invalid");
  await page.getByLabel("Preferred contact method").selectOption("email");
  await page.locator('[name="contactConsent"]').check();
  await page.locator('[name="fictional"]').check();
}
test("public pages retain premium identity, exact referral, privacy and mobile layout", async ({
  page,
}, info) => {
  for (const path of ["/", "/veterans/"]) {
    await page.goto(path);
    await expect(page.locator("h1")).toContainText("Protect Your Family");
    await expect(
      page
        .locator('a[href="https://app.ethoslife.com/partner/780a6/q/goals"]')
        .first(),
    ).toBeVisible();
    await expect(page.locator("body")).not.toContainText("$37");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("public-premium.png"),
    fullPage: true,
  });
});
test("unconfigured API hides intake and never claims a save", async ({
  page,
}, info) => {
  await page.goto("/find-coverage/");
  await expect(page.locator("#intake-availability")).toContainText(
    "currently unavailable",
  );
  await expect(page.locator("#coverage-form")).toBeHidden();
  await expect(page.locator("#intake-confirmation")).toBeHidden();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("intake-unconfigured.png"),
    fullPage: true,
  });
});
test("questionnaire UI with a stubbed transport validates, navigates back and safely retries lost responses", async ({
  page,
}, info) => {
  const keys = [];
  let calls = 0;
  await page.route("**/api/intake", async (route) => {
    keys.push(route.request().headers()["idempotency-key"]);
    calls++;
    const payload = route.request().postDataJSON();
    expect(payload.consent.marketing).toBe(false);
    expect(payload.fictional).toBe(true);
    if (calls === 1) return route.abort("failed");
    return route.fulfill({
      status: 200,
      json: {
        accepted: true,
        receipt: "00000000-0000-4000-8000-000000000001",
        appointmentRequested: false,
      },
    });
  });
  await questionnaire(page);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByLabel("State of residence")).toHaveValue("CA");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByLabel("First name", { exact: true })).toHaveValue(
    "Fictional",
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("questionnaire-fictional-contact-ui.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Send my request" }).click();
  await expect(page.locator("#form-error")).toContainText("could not confirm");
  await expect(page.locator("#intake-confirmation")).toBeHidden();
  await page.getByRole("button", { name: "Send my request" }).click();
  await expect(page.locator("#confirmation-title")).toHaveText(
    "Your test request is saved.",
  );
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  expect(
    await page.evaluate(() => localStorage.length + sessionStorage.length),
  ).toBe(0);
});
test("required answers and contact consent block requests; optional marketing is unchecked", async ({
  page,
}) => {
  await page.route("**/api/config", (route) => route.fulfill({ json: config }));
  await page.goto("/find-coverage/");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#step-label")).toContainText("Step 1");
  await expect(page.locator("#form-error")).toBeVisible();
  await questionnaire(page);
  await page.locator('[name="contactConsent"]').uncheck();
  await expect(page.locator('[name="marketingConsent"]')).not.toBeChecked();
  let posted = false;
  await page.route("**/api/intake", (route) => {
    posted = true;
    return route.abort();
  });
  await page.getByRole("button", { name: "Send my request" }).click();
  expect(posted).toBe(false);
  await expect(page.locator("#intake-confirmation")).toBeHidden();
});
test("private dashboard starts behind authentication and does not fabricate leads", async ({
  page,
}, info) => {
  await page.goto("/admin/leads/");
  await expect(page.locator("body")).toContainText(
    /sign in|not configured|unavailable/i,
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("admin-authentication-gate.png"),
    fullPage: true,
  });
});
