const $ = selector => document.querySelector(selector);
const all = (selector, context = document) => [...context.querySelectorAll(selector)];
const startButton = $('#start-review');
startButton.hidden = false;

// Direct booking works without JavaScript. Preserve campaign tags only;
// questionnaire answers never leave this page or enter browser storage.
const campaign = new URLSearchParams(location.search);
const calendar = new URL('https://calendly.com/anvar-life/15min');
['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(key => {
  if (campaign.get(key)) calendar.searchParams.set(key, campaign.get(key));
});
all('[data-booking-cta]').forEach(link => { link.href = calendar.toString(); });

startButton.addEventListener('click', () => {
  if (!$('#result').hidden) {
    $('#result').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    $('#result-title').focus({ preventScroll: true });
    return;
  }
  $('#review').hidden = false;
  $('#review').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  all('.quiz-step:not([hidden]) input, .quiz-step:not([hidden]) select')[0]?.focus({ preventScroll: true });
});

const form = $('#veteran-review');
const steps = all('.quiz-step');
const backButton = $('#back-step');
const nextButton = $('#next-step');
const error = $('#form-error');
let currentStep = 0;

function stepIsValid(step) {
  const required = all('[required]', step);
  for (const field of required) {
    if (field.type === 'radio') {
      if (!step.querySelector(`input[name="${field.name}"]:checked`)) return false;
    } else if (field.type === 'checkbox') {
      if (!field.checked) return false;
    } else if (!field.value) return false;
  }
  if (step.dataset.step === '3' && !step.querySelector('input[name="goal"]:checked')) return false;
  if (step.dataset.step === '4' && !step.querySelector('input[name="existing"]:checked')) return false;
  return true;
}

function showStep(index) {
  currentStep = index;
  steps.forEach((step, i) => { step.hidden = i !== index; });
  const percent = Math.round((index + 1) / steps.length * 100);
  $('#step-label').textContent = `Step ${index + 1} of ${steps.length}`;
  $('#step-percent').textContent = `${percent}%`;
  $('#step-progress').style.width = `${percent}%`;
  backButton.hidden = index === 0;
  nextButton.textContent = index === steps.length - 1 ? 'See my next step' : 'Continue';
  error.hidden = true;
}

nextButton.addEventListener('click', () => {
  if (!stepIsValid(steps[currentStep])) {
    error.hidden = false;
    steps[currentStep].querySelector('input,select')?.focus();
    return;
  }
  if (currentStep < steps.length - 1) {
    showStep(currentStep + 1);
    form.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    return;
  }
  finishReview();
});

backButton.addEventListener('click', () => showStep(Math.max(0, currentStep - 1)));

function values(name) {
  return all(`[name="${name}"]:checked`, form).map(input => input.value);
}

function finishReview() {
  const data = new FormData(form);
  const state = data.get('state');
  const stateLabel = state === 'CA' ? 'California' : state === 'WV' ? 'West Virginia' : 'Another state';
  const summary = [
    ['Household', data.get('service')],
    ['State / age', `${stateLabel} · ${data.get('age')}`],
    ['Priorities', values('goal').join(', ')],
    ['Coverage range', data.get('coverage')],
    ['Existing protection', values('existing').join(', ')],
    ['Budget', data.get('budget')]
  ];
  $('#answer-summary').innerHTML = summary.map(([term, value]) => `<div><dt>${term}</dt><dd>${value}</dd></div>`).join('');
  $('#result-copy').textContent = ['CA', 'WV'].includes(state)
    ? 'Your answers are ready for a licensed conversation. They do not determine approval or price; Anvar will confirm needs, active carrier appointments, underwriting, and policy terms during the call.'
    : 'Your state requires a licensing and availability check before private insurance options can be discussed. Scheduling a call does not guarantee that Anvar or a participating carrier can serve your state.';

  $('#review').hidden = true;
  $('#result').hidden = false;
  startButton.textContent = 'View my preparation notes';
  $('#result').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  $('#result-title').focus?.({ preventScroll: true });
}

// Keep Enter from navigating or submitting this local-only checklist.
form.addEventListener('submit', event => {
  event.preventDefault();
  nextButton.click();
});

showStep(0);
