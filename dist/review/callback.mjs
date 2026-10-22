// Review prototype only. No request is sent, persisted or recorded as consent.
// Do not connect this module to live intake. See docs/conversion-review.md.
export const REVIEW_PRODUCTS = Object.freeze(['final_expense', 'term_life', 'term_life_living_benefits']);
export const REVIEW_STATES = Object.freeze('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '));
export function validateReview(values) {
  if (typeof values.name !== 'string' || !values.name.trim() || values.name.trim().length > 80) return { field: 'name', message: 'Enter a fictional name, up to 80 characters.' };
  const phone = typeof values.phone === 'string' ? values.phone.replace(/[\s()+.-]/g, '').replace(/^1(?=\d{10}$)/, '') : '';
  if (!/^20255501\d{2}$/.test(phone)) return { field: 'phone', message: 'Use a reserved fictional number: 202-555-0100 through 202-555-0199. Do not enter a real phone number.' };
  if (!REVIEW_STATES.includes(values.state)) return { field: 'state', message: 'Choose a state for this fictional review. Availability is not confirmed.' };
  if (!REVIEW_PRODUCTS.includes(values.product)) return { field: 'product', message: 'Choose one of the three product topics.' };
  if (values.contactConsent !== true) return { field: 'contactConsent', message: 'Check the draft callback permission to test this form. No consent will be recorded.' };
  if (values.fictional !== true) return { field: 'fictional', message: 'Confirm that every answer is fictional test information.' };
  return null;
}
if (typeof document !== 'undefined') {
  const form = document.querySelector('#callback-form');
  if (form) {
    const error = document.querySelector('#callback-error');
    const result = document.querySelector('#callback-result');
    const fields = document.querySelector('#callback-fields');
    const clearFeedback = () => {
      error.hidden = true; error.textContent = ''; result.hidden = true;
      for (const input of form.querySelectorAll('[aria-invalid]')) {
        input.removeAttribute('aria-invalid');
        if (input.name === 'phone') input.setAttribute('aria-describedby', 'phone-help');
        else input.removeAttribute('aria-describedby');
      }
    };
    // Keep fields inert without the handler, including when JavaScript fails to load.
    form.addEventListener('submit', event => {
      event.preventDefault(); clearFeedback();
      const values = Object.fromEntries(new FormData(form));
      values.contactConsent = form.elements.contactConsent.checked;
      values.fictional = form.elements.fictional.checked;
      const problem = validateReview(values);
      if (problem) {
        error.textContent = problem.message; error.hidden = false;
        const field = form.elements.namedItem(problem.field);
        field.setAttribute('aria-invalid', 'true'); field.setAttribute('aria-describedby', field.name === 'phone' ? 'phone-help callback-error' : 'callback-error'); field.focus();
        return;
      }
      form.reset();
      result.textContent = 'Demo check complete. Nothing was sent or saved. No callback or appointment has been requested. Your fictional answers have been cleared.';
      result.hidden = false; result.focus();
    });
    form.addEventListener('reset', clearFeedback);
    form.addEventListener('input', clearFeedback);
    window.addEventListener('pagehide', () => { form.reset(); clearFeedback(); });
    window.addEventListener('pageshow', event => { if (event.persisted) { form.reset(); clearFeedback(); } });
    fields.disabled = false;
  }
}
