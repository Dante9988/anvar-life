import { test, expect } from '@playwright/test';

// Fictional API responses are confined to this test file. They are never shipped.
const callId = '20000000-0000-4000-8000-000000000001';
const leadId = '10000000-0000-4000-8000-000000000001';
const vendorId = '30000000-0000-4000-8000-000000000001';
const agentId = '40000000-0000-4000-8000-000000000001';
const fixture = {
  id: callId, lead_id: leadId, vendor_source_id: vendorId, vendor_name: 'Fictional Harbor Leads',
  mapped_agent_id: agentId, mapped_agent_email: 'agent@example.invalid', lead_name: 'Fictional Preview Person',
  from_number: '+12025550100', to_number: '+12025550199', direction: 'inbound', status: 'answered',
  started_at: '2026-10-11T10:00:00Z', ended_at: '2026-10-11T10:03:12Z', last_event_at: '2026-10-11T10:03:12Z',
  duration_seconds: 192, recording_status: 'available_unreviewed', consent_status: 'unknown',
  disposition: 'connected', callback_at: null, follow_up_hold: true, lead_do_not_contact: false,
  do_not_contact: false, reply_received: false,
};
const capabilities = { provider: 'kixie', mode: 'fictional_preview', ingestionEnabled: false, accountConnectionVerified: false, liveCollectionEnabled: false, clickToCallEnabled: false, followUpSendingEnabled: false, recordingPlaybackEnabled: false, setupRequired: true };
const production = {
  policies: [{ id: '50000000-0000-4000-8000-000000000001', lead_id: leadId, product: 'whole_life', carrier: 'Fictional Carrier', external_reference: 'FICTIONAL-POLICY-01', status: 'submitted', status_verified_at: null, verification_reference: null }],
  summary: { earnedCents: 90000, paidCents: 30000, advancedCents: 10000, chargebackCents: 5000, vendorCostCents: 15000, telephonyCostCents: 2000, netCashCents: 18000, recordedLedgerNetCents: 18000, cashRoi: null, reconciliationRequired: true, policiesWithoutCashEvidence: 1 },
  retention: [30, 60, 90].map(days => ({ days, eligible: 1, verified: 0, active: 0, unknown: 1, rate: null })),
};
async function setup(page, overrides = {}) {
  const record = structuredClone(fixture);
  const control = { role: 'owner', sessionStatus: 200, authenticated: true, listStatus: 200, mutationStatus: 200, records: [record, ...['missed', 'ringing', 'unknown'].map((status, index) => ({ ...fixture, id: `20000000-0000-4000-8000-00000000000${index + 2}`, status, from_number: `+1202555010${index + 1}`, duration_seconds: null, lead_id: null, lead_name: null, vendor_source_id: null, vendor_name: null, mapped_agent_id: null, mapped_agent_email: null, disposition: null, recording_status: 'not_provided' }))], record, notes: [], tasks: [], candidates: [], reads: [], mutations: [], ...overrides };
  await page.route('**/api/**', async route => {
    const request = route.request(); const url = new URL(request.url()); const path = url.pathname;
    let body = {}, status = 200;
    if (path === '/api/admin/session') {
      status = control.sessionStatus;
      body = status === 200 ? { authenticated: control.authenticated, user: { id: 'fictional-owner', email: 'owner@example.invalid', role: control.role }, csrfToken: 'test-csrf' } : { error: { message: status === 503 ? 'Workspace infrastructure is not configured.' : 'Sign in required.' } };
    } else if (request.method() !== 'GET') {
      const patch = request.postDataJSON(); control.mutations.push({ path, body: patch, csrf: request.headers()['x-csrf-token'] });
      status = control.mutationStatus;
      if (status === 200) {
        if (path === '/api/auth/logout') body = { localSignedOut: true, remoteRevocationConfirmed: true };
        else {
          if (path.endsWith('/link')) { control.record.lead_id = patch.leadId; control.record.lead_name = fixture.lead_name; }
          for (const key of ['disposition', 'callback_at', 'follow_up_hold']) if (key in patch) control.record[key] = patch[key];
          if (patch.note) control.notes.unshift({ body: patch.note, created_at: '2026-10-11T11:00:00Z' });
          if (patch.disposition === 'do_not_contact') control.record.do_not_contact = true;
          if (patch.callback_at) control.tasks = [{ status: 'held', hold_reason: 'live_outbound_disabled', due_at: patch.callback_at }];
          if (control.record.do_not_contact) control.tasks = [{ status: 'suppressed', hold_reason: 'do_not_contact', due_at: patch.callback_at || '2026-10-12T12:00:00Z' }];
          body = { call: control.record };
        }
      } else body = { error: { message: 'Save rejected by server.' } };
    } else {
      control.reads.push(path + url.search);
      if (path === '/api/admin/calls') { status = control.listStatus; const calls = control.records.filter(c => (!url.searchParams.get('status') || c.status === url.searchParams.get('status')) && (!url.searchParams.get('vendor') || c.vendor_source_id === url.searchParams.get('vendor'))); body = status === 200 ? { calls, total: calls.length, page: 1, pageSize: 25 } : { error: { message: 'Call history is temporarily unavailable.' } }; }
      else if (path === '/api/admin/integrations/kixie') body = capabilities;
      else if (path === `/api/admin/calls/${callId}`) body = { call: control.record, notes: control.notes, tasks: control.tasks, candidates: control.candidates, events: [] };
      else if (path === '/api/admin/production') body = production;
      else { status = 404; body = { error: { message: 'No fictional fixture for this endpoint.' } }; }
    }
    await route.fulfill({ status, json: body });
  });
  return control;
}
async function openCall(page) { await page.goto('/admin/calls'); await page.getByRole('button', { name: fixture.from_number, exact: true }).click(); await expect(page.getByRole('heading', { name: fixture.from_number, exact: true })).toBeVisible(); }
for (const [status, title] of [[401, 'A secure space for your team'], [403, 'Access is restricted'], [503, 'Workspace not connected']]) {
  test(`calls fail closed with session ${status}`, async ({ page }) => {
    const control = await setup(page, { sessionStatus: status }); await page.goto(`/admin/calls?call=${callId}`);
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    expect(control.reads).toEqual([]); await expect(page.getByText(fixture.from_number)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Production economics' })).toHaveCount(0);
  });
}
test('unsupported or incomplete sessions cannot read records', async ({ page }) => {
  const control = await setup(page, { role: 'manager' }); await page.goto('/admin/calls');
  await expect(page.getByRole('heading', { name: 'Access is restricted' })).toBeVisible(); expect(control.reads).toEqual([]);
  control.role = 'owner'; control.authenticated = false; await page.reload();
  await expect(page.getByRole('heading', { name: 'Access is restricted' })).toBeVisible(); expect(control.reads).toEqual([]);
});
test('history has honest attribution, unknowns, disabled calling, and mobile fit', async ({ page }, info) => {
  await setup(page); await page.goto('/admin/calls');
  await expect(page.getByRole('heading', { name: 'Call workspace', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Kixie click-to-call unavailable' })).toBeDisabled();
  await expect(page.getByText('Live collection, Kixie click-to-call', { exact: false })).toBeVisible();
  await expect(page.locator('.call-table [data-label="Vendor / agent"]').first()).toContainText('Fictional Harbor Leads');
  await expect(page.getByText('Inbound · 3m 12s')).toBeVisible();
  await expect(page.getByText('Consent: Unknown')).toHaveCount(4);
  await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('fictional-calls.png'), fullPage: true });
  await page.getByRole('button', { name: fixture.from_number, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recording & consent' })).toBeVisible();
  expect(await page.locator('#call-dialog').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('fictional-call-detail.png'), fullPage: true });
});
test('filters send bounded status/vendor queries and empty results stay honest', async ({ page }) => {
  const control = await setup(page); await page.goto('/admin/calls');
  await page.getByLabel('Call status', { exact: true }).selectOption('missed'); await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.locator('.call-table tbody tr')).toHaveCount(1); expect(control.reads.some(r => r.includes('status=missed'))).toBe(true);
  await page.getByLabel('Vendor attribution', { exact: true }).selectOption(vendorId); await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByText('No matching calls', { exact: true })).toBeVisible();
});
test('agent cannot read economics; detail has no sale control', async ({ page }) => {
  const control = await setup(page, { role: 'agent' }); await openCall(page);
  await expect(page.getByRole('button', { name: 'Production economics' })).toHaveCount(0);
  expect(control.reads).not.toContain('/api/admin/production');
  expect(await page.getByLabel('Call disposition', { exact: true }).locator('option').allTextContents()).not.toContain('Sold');
});
test('rejected save preserves edits and explicit retry saves a held callback with CSRF', async ({ page }) => {
  const control = await setup(page); await openCall(page);
  await page.getByLabel('Call disposition', { exact: true }).selectOption('callback_requested');
  await page.getByLabel('Callback date & time').fill('2026-10-12T12:00');
  await page.getByLabel('Add an internal note').fill('Fictional callback request.');
  control.mutationStatus = 422; await page.getByRole('button', { name: 'Save call update' }).click();
  await expect(page.getByText('Save rejected by server.')).toBeVisible();
  await expect(page.getByLabel('Add an internal note')).toHaveValue('Fictional callback request.');
  await expect(page.getByText('Call update saved.', { exact: false })).toHaveCount(0);
  control.mutationStatus = 200; await page.getByRole('button', { name: 'Save call update' }).click();
  await expect(page.locator('#detail-message')).toContainText('Call update saved. No outreach was sent.');
  expect(control.mutations.at(-1).csrf).toBe('test-csrf');
  expect(control.mutations.at(-1).body).toEqual({ disposition: 'callback_requested', callback_at: '2026-10-12T12:00:00.000Z', note: 'Fictional callback request.' });
  await expect(page.locator('.task-list')).toContainText('Held'); await expect(page.getByLabel('Add an internal note')).toHaveValue('');
});
test('rapid repeated submissions issue only one pending mutation', async ({ page }) => {
  const control = await setup(page); await openCall(page); await page.getByLabel('Add an internal note').fill('Fictional single note.');
  let pending; const intercepted = new Promise(resolve => { pending = resolve; }); let writes = 0;
  await page.route(`**/api/admin/calls/${callId}`, async route => { if (route.request().method() === 'PATCH') { writes++; pending(route); } else await route.fallback(); });
  await page.locator('#call-update').evaluate(form => { form.requestSubmit(); form.requestSubmit(); form.requestSubmit(); });
  const route = await intercepted; expect(writes).toBe(1); await expect(page.getByRole('button', { name: 'Save call update' })).toBeDisabled();
  await route.fulfill({ json: { call: control.record } }); await expect(page.locator('#detail-message')).toContainText('Call update saved.'); expect(writes).toBe(1);
});
test('uncertain mutation is not retried until record is reloaded', async ({ page }) => {
  await setup(page); await openCall(page); await page.getByLabel('Add an internal note').fill('Fictional interrupted note.');
  let writes = 0;
  await page.route(`**/api/admin/calls/${callId}`, route => { if (route.request().method() === 'PATCH') { writes++; return route.abort('failed'); } return route.fallback(); });
  await page.getByRole('button', { name: 'Save call update' }).click();
  await expect(page.getByText(/We could not confirm this change/)).toBeVisible(); await expect(page.getByRole('button', { name: 'Save call update' })).toBeDisabled();
  expect(writes).toBe(1); await page.getByRole('button', { name: 'Reload record before editing' }).click();
  await expect(page.getByRole('button', { name: 'Save call update' })).toBeEnabled(); await expect(page.getByLabel('Add an internal note')).toHaveValue('');
});
test('DNC is sticky and prevents callback or hold release', async ({ page }) => {
  const control = await setup(page); await openCall(page);
  await page.getByLabel('Call disposition', { exact: true }).selectOption('do_not_contact');
  await expect(page.getByLabel('Callback date & time')).toBeDisabled(); await expect(page.getByLabel('Keep a manual follow-up hold')).toBeChecked();
  await page.getByRole('button', { name: 'Save call update' }).click();
  await expect(page.getByText('Do not contact. Follow-up is suppressed.')).toBeVisible();
  expect(control.mutations.at(-1).body).toEqual({ disposition: 'do_not_contact' });
  await page.getByLabel('Call disposition', { exact: true }).selectOption('connected');
  await expect(page.getByLabel('Callback date & time')).toBeDisabled(); await expect(page.getByLabel('Keep a manual follow-up hold')).toBeDisabled();
});
test('closing delayed detail discards the response and reopening stays usable', async ({ page }) => {
  const control = await setup(page); let release; const intercepted = new Promise(resolve => { release = resolve; });
  await page.route(`**/api/admin/calls/${callId}`, route => release(route));
  await page.goto('/admin/calls'); await page.getByRole('button', { name: fixture.from_number, exact: true }).click(); const pending = await intercepted;
  await page.getByRole('button', { name: 'Close call' }).click(); await pending.fulfill({ json: { call: control.record, notes: [], tasks: [], events: [] } });
  await expect(page.locator('#call-dialog')).not.toBeVisible(); await expect(page.locator('#detail')).toHaveText('');
  await page.unroute(`**/api/admin/calls/${callId}`); await page.getByRole('button', { name: fixture.from_number, exact: true }).click();
  await expect(page.getByRole('heading', { name: fixture.from_number, exact: true })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.locator('#detail')).toHaveText('');
});
test('session expiration during a save clears all private data', async ({ page }) => {
  const control = await setup(page); await openCall(page); await page.getByLabel('Add an internal note').fill('Fictional expired update.');
  control.mutationStatus = 401; await page.getByRole('button', { name: 'Save call update' }).click();
  await expect(page.getByText('Your session has expired. Sign in again to continue.')).toBeVisible();
  await expect(page.getByText(fixture.from_number)).toHaveCount(0); await expect(page.locator('#detail')).toHaveText('');
  await expect(page.getByText('owner@example.invalid')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
});
test('read errors retry; stalled reads time out without manufactured empty data', async ({ page }) => {
  const control = await setup(page, { listStatus: 503 }); await page.goto('/admin/calls');
  await expect(page.getByRole('heading', { name: 'We couldn’t load this view' })).toBeVisible();
  control.listStatus = 200; await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('button', { name: fixture.from_number, exact: true })).toBeVisible();
  await page.clock.install(); let release; const intercepted = new Promise(resolve => { release = resolve; });
  await page.route('**/api/admin/calls?**', route => release(route)); await page.getByRole('button', { name: 'Refresh', exact: true }).click(); const pending = await intercepted;
  await page.clock.fastForward(16000); await expect(page.getByText(/The secure connection timed out or was interrupted/)).toBeVisible(); await pending.abort().catch(() => {});
});
test('production stages, evidence gaps and whole-life math stay separate', async ({ page }, info) => {
  const control = await setup(page); await page.goto('/admin/calls'); await page.getByRole('button', { name: 'Production economics', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Production economics', exact: true })).toBeVisible();
  expect(await page.locator('.stage-strip li > span:nth-child(2)').allTextContents()).toEqual(['Qualified', 'Quoted', 'Application', 'Submitted', 'Issued', 'Paid', 'Active']);
  await expect(page.getByText('Awaiting reconciliation', { exact: true })).toBeVisible();
  await expect(page.getByText(/1 policies lack cash evidence/)).toBeVisible();
  const output = page.locator('#illustration-results');
  await expect(output).toContainText('$900.00'); await expect(output).toContainText('$585.00'); await expect(output).toContainText('$438.75');
  await expect(output).toContainText('Revenue recognized by this estimate$0.00');
  const amounts = await page.locator('.finance-grid .metric-value').allTextContents(); expect(amounts).toEqual(['$300.00', '$900.00', '$100.00', '$50.00', '$150.00', '$20.00']);
  await expect(page.getByText('It does not apply to term or IUL.', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('fictional-production.png'), fullPage: true });
  await page.getByLabel('Issue age', { exact: true }).fill('60'); await page.getByRole('button', { name: 'Calculate illustration' }).click();
  await expect(output).toContainText('$351.00'); await expect(output).toContainText('$263.25');
  expect(await page.locator('.finance-grid .metric-value').allTextContents()).toEqual(amounts); expect(control.mutations).toEqual([]);
});
test('sign-out and pagehide clear records; a restored page rechecks authentication', async ({ page }) => {
  const control = await setup(page); await page.goto('/admin/calls'); await expect(page.getByRole('button', { name: fixture.from_number, exact: true })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  await expect(page.locator('#content')).toHaveText(''); await expect(page.locator('#account')).toHaveText('Secure workspace');
  control.sessionStatus = 401; await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect(page.getByRole('heading', { name: 'A secure space for your team' })).toBeVisible();
  control.sessionStatus = 200; await page.reload(); await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByText(/You have been signed out/)).toBeVisible(); await expect(page.getByText(fixture.from_number)).toHaveCount(0);
});

test('sticky DNC and reply suppression survive a later connected disposition', async ({ page }) => {
  const control = await setup(page); control.record.do_not_contact = true; control.record.disposition = 'connected';
  await openCall(page); await expect(page.getByText('Do not contact. Follow-up is suppressed.')).toBeVisible();
  await expect(page.getByLabel('Callback date & time')).toBeDisabled();
  await page.getByRole('button', { name: 'Close call' }).click();
  control.record.do_not_contact = false; control.record.reply_received = true;
  await page.getByRole('button', { name: fixture.from_number, exact: true }).click();
  await expect(page.getByText('Reply received. Follow-up is stopped. No outreach is sent.')).toBeVisible();
});

test('owner explicitly verifies a candidate identity before linking; admins cannot link', async ({ page }) => {
  const control = await setup(page); control.record.lead_id = null; control.record.lead_name = null;
  control.candidates = [{ lead_id: leadId, name: fixture.lead_name, state: 'TX', product: 'whole_life', reason: 'possible_phone_match' }];
  await openCall(page); await expect(page.getByText('A phone match alone is insufficient.', { exact: false })).toBeVisible();
  await page.getByLabel('Possible lead matches').selectOption(leadId);
  await expect(page.getByLabel('Verified lead ID')).toHaveValue(leadId);
  await page.getByLabel('Identity verification reason').fill('Fictional test identity confirmed by owner.');
  await page.getByRole('button', { name: 'Confirm verified lead link' }).click();
  await expect(page.locator('#detail-message')).toContainText('Verified lead link saved. No outreach was sent.');
  expect(control.mutations.at(-1)).toEqual({ path: `/api/admin/calls/${callId}/link`, body: { leadId, reason: 'Fictional test identity confirmed by owner.' }, csrf: 'test-csrf' });
  await expect(page.getByRole('button', { name: 'Confirm verified lead link' })).toHaveCount(0);
  control.record.lead_id = null; control.record.lead_name = null; control.role = 'admin';
  await openCall(page); await expect(page.getByRole('heading', { name: 'Review caller identity' })).toHaveCount(0);
});

test('closing an in-flight update cannot reopen the call or announce stale success', async ({ page }) => {
  const control = await setup(page); await openCall(page); await page.getByLabel('Add an internal note').fill('Fictional delayed update.');
  let release; const intercepted = new Promise(resolve => { release = resolve; });
  await page.route(`**/api/admin/calls/${callId}`, route => route.request().method() === 'PATCH' ? release(route) : route.fallback());
  await page.getByRole('button', { name: 'Save call update' }).click(); const pending = await intercepted;
  await page.getByRole('button', { name: 'Close call' }).click(); await pending.fulfill({ json: { call: control.record } });
  await expect(page.locator('#call-dialog')).not.toBeVisible(); await expect(page.locator('#detail')).toHaveText('');
  await expect(page.locator('#notice')).not.toContainText('saved');
});

test('deep links require authorization, and rendered data is escaped', async ({ page }) => {
  const control = await setup(page); control.record.vendor_name = '<img src=x onerror="window.fixtureUnsafe=true">';
  control.notes = [{ body: '<script>window.fixtureUnsafe=true</script>', created_at: fixture.started_at }];
  await page.goto(`/admin/calls?call=${callId}`);
  await expect(page.getByRole('heading', { name: fixture.from_number, exact: true })).toBeVisible();
  await expect(page.locator('.note-body')).toHaveText('<script>window.fixtureUnsafe=true</script>');
  expect(await page.evaluate(() => window.fixtureUnsafe)).toBeUndefined();
  await expect(page.locator('#detail img')).toHaveCount(0);
  await page.goto('/admin/calls?call=not-a-valid-id'); await expect(page.locator('#call-dialog')).not.toBeVisible();
});
