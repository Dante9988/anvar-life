// No personal information is stored in browser storage, URLs, analytics or console logs.
const form = document.querySelector('#coverage-form');
const sections = [...form.querySelectorAll('fieldset[data-step]')];
const notice = document.querySelector('#intake-availability');
const error = document.querySelector('#form-error');
const next = document.querySelector('#step-next');
const back = document.querySelector('#step-back');
const submit = document.querySelector('#submit-request');
const retry = document.querySelector('#retry-intake');
const labels = ['Your priorities', 'Your age range', 'Your context', 'Your contact preferences', 'Request saved'];
let step = 1;
let config;
let submitting = false;
let lastPayload = '';
let requestKey;
const value = name => form.elements.namedItem(name)?.value || '';
const checked = name => form.elements.namedItem(name)?.checked === true;
function message(text) { error.textContent = text; error.hidden = false; error.focus(); }
function showStep(number) {
  step = number;
  sections.forEach((section, index) => { section.hidden = index + 1 !== step; section.disabled = index + 1 !== step; });
  back.hidden = step === 1;
  next.hidden = step === 4;
  submit.hidden = step !== 4;
  error.hidden = true;
  document.querySelector('#step-label').textContent = `Step ${step} of 5 · ${labels[step - 1]}`;
  document.querySelector('#intake-progress').value = step;
  sections[step - 1].querySelector('legend').focus();
}
function validStep() {
  for (const field of sections[step - 1].querySelectorAll('input, select')) {
    field.removeAttribute('aria-invalid');
    if (!field.checkValidity()) {
      field.setAttribute('aria-invalid', 'true');
      message(field.type === 'checkbox' ? 'Please confirm the required consent before continuing.' : 'Please complete the required fields with a valid answer.');
      field.focus();
      field.reportValidity();
      return false;
    }
  }
  return true;
}
next.addEventListener('click', () => { if (validStep()) showStep(step + 1); });
back.addEventListener('click', () => { if (!submitting) showStep(step - 1); });
form.addEventListener('input', () => { error.hidden = true; });
retry.addEventListener('click', loadConfig);
async function loadConfig() {
  retry.hidden = true;
  notice.textContent = 'Checking secure intake availability…';
  try {
    const response = await fetch('/api/config', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('unavailable');
    const data = await response.json();
    if (!data.configured || !data.intakeEnabled || !['fictional_preview','production'].includes(data.mode) || !data.consent?.version || !data.consent.contactText || !data.consent.marketingText) throw new Error('unavailable');
    config = data;
    document.querySelector('#human-consent-copy').textContent = data.consent.contactText;
    document.querySelector('#marketing-consent-copy').textContent = data.consent.marketingText;
    const preview = data.mode === 'fictional_preview';
    notice.textContent = preview ? 'FICTIONAL TEST PREVIEW ONLY. Use made-up names, contact details and answers. No real personal information. No agent will contact you from this test.' : 'Your request will be securely saved for agency follow-up. Do not include health, financial or identity documents.';
    document.querySelector('#fictional-confirmation').hidden = !preview;
    form.elements.fictional.required = preview;
    form.hidden = false;
  } catch {
    form.hidden = true;
    notice.textContent = 'Online requests are currently unavailable. Nothing has been submitted. You can still use Check My Rate to continue directly to Ethos. Please do not email sensitive personal information.';
    retry.hidden = false;
  }
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submitting) return;
  if (step < 4) { if (validStep()) showStep(step + 1); return; }
  if (!validStep() || !config?.intakeEnabled) return;
  const productMap = { family: 'term_life', final_expense: 'final_expense', mortgage_income: 'mortgage_protection', long_term: 'retirement', unsure: 'unsure' };
  const payload = {
    name: `${value('firstName').trim()} ${value('lastName').trim()}`,
    email: value('email').trim(), phone: value('phone').trim(), state: value('state'),
    product: productMap[value('interest')], interest: value('interest'), ageRange: value('ageRange'),
    budget: value('budget') || null, preferredContact: value('preferredContact'),
    intent: checked('appointmentRequested') ? 'appointment' : 'quote',
    consent: { contact: checked('contactConsent'), marketing: checked('marketingConsent'), version: config.consent.version },
    sourcePath: '/find-coverage/', website: value('website'),
    fictional: config.mode === 'fictional_preview' && checked('fictional')
  };
  const serialized = JSON.stringify(payload);
  // Identical retries reuse the key so a lost response cannot create a second lead.
  if (serialized !== lastPayload || !requestKey) { requestKey = crypto.randomUUID(); lastPayload = serialized; }
  submitting = true; submit.disabled = true; back.disabled = true;
  submit.textContent = 'Saving your request…'; error.hidden = true;
  form.setAttribute('aria-busy', 'true');
  sections[3].disabled = true;
  try {
    const response = await fetch('/api/intake', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestKey }, body: serialized,
      signal: AbortSignal.timeout(20000)
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.accepted !== true || typeof data.receipt !== 'string' || !/^[0-9a-f-]{36}$/i.test(data.receipt)) {
      const messages = {429: 'Too many requests. Please wait a few minutes, then try again.', 409: 'We could not safely confirm this request. Please try again or contact the agency.', 503: 'Online requests are temporarily unavailable. Your answers remain on this page; please try again later.', 400: 'Please review your contact details and required consent, then try again.', 403: 'This request could not be accepted. In a preview, confirm that all your answers are fictional test data.'};
      throw new Error(messages[response.status] || 'We could not confirm that your request was saved. Your answers remain on this page. Please retry.');
    }
    form.hidden = true;
    document.querySelector('#intake-confirmation').hidden = false;
    document.querySelector('#step-label').textContent = 'Step 5 of 5 · Request saved';
    document.querySelector('#intake-progress').value = 5;
    document.querySelector('#confirmation-title').textContent = config.mode === 'fictional_preview' ? 'Your test request is saved.' : 'Your request is saved.';
    document.querySelector('#confirmation-copy').textContent = config.mode === 'fictional_preview' ? 'Your fictional test request was saved to the preview database. No real follow-up or appointment has been scheduled.' : data.appointmentRequested ? 'Your consultation request has been saved. A team member can follow up about scheduling. No appointment is booked yet.' : 'Your request has been received for follow-up. Availability depends on your state and the appropriate licensed team member.';
    document.querySelector('#confirmation-reference').textContent = `Reference: ${data.receipt}`;
    document.querySelector('#confirmation-title').focus();
    form.reset(); lastPayload = ''; requestKey = undefined;
  } catch (cause) {
    message(cause.name === 'TimeoutError' || cause.name === 'TypeError' ? 'We could not confirm whether your request was saved. Your answers remain on this page. Retry to safely check or save the same request.' : cause.message);
  } finally {
    submitting = false; submit.disabled = false; back.disabled = false; sections[3].disabled = false;
    submit.textContent = 'Send my request →'; form.removeAttribute('aria-busy');
  }
});
// Clear unsent answers even when the browser keeps the page in its back/forward cache.
window.addEventListener('pagehide', () => {
  form.reset(); lastPayload = ''; requestKey = undefined;
});
window.addEventListener('pageshow', event => {
  if (event.persisted && !form.hidden) showStep(1);
});
loadConfig();
