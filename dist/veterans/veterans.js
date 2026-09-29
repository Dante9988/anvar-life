const $ = selector => document.querySelector(selector);
const all = (selector, context = document) => [...context.querySelectorAll(selector)];
const videoShell = $('.video-shell');
const video = $('.funnel-video');
const placeholder = $('.video-placeholder');
const startButton = $('#start-review');
const unlockStatus = $('#unlock-status');
const previewNote = $('#preview-note');
const videoSource = videoShell.dataset.videoSrc?.trim();
const previewMode = new URLSearchParams(location.search).get('preview') === '1';

function unlockReview(message) {
  startButton.disabled = false;
  unlockStatus.textContent = message;
  $('.lock-icon').textContent = '✓';
  $('.lock-icon').style.color = 'var(--accent)';
}

if (videoSource) {
  video.src = videoSource;
  video.hidden = false;
  placeholder.hidden = true;
  video.addEventListener('timeupdate', () => {
    const percent = video.duration ? Math.min(100, video.currentTime / video.duration * 100) : 0;
    $('.video-progress span').style.width = `${percent}%`;
  });
  video.addEventListener('ended', () => unlockReview('Video complete. Your private coverage review is ready.'));
} else if (previewMode) {
  previewNote.hidden = false;
  startButton.textContent = 'Preview the coverage review';
  unlockReview('Preview unlocked. Add the final video before running ads.');
} else {
  unlockStatus.textContent = 'The final video is being prepared. The review will unlock when it ends.';
}

startButton.addEventListener('click', () => {
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

  const campaign = new URLSearchParams(location.search);
  const calendar = new URL('https://calendly.com/anvar-life/15min');
  ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'].forEach(key => {
    if (campaign.get(key)) calendar.searchParams.set(key, campaign.get(key));
  });
  $('#book-call').href = calendar.toString();
  try { sessionStorage.setItem('veteran-review-summary', JSON.stringify(Object.fromEntries(summary))); } catch { /* Optional browser storage. */ }
  $('#review').hidden = true;
  $('#result').hidden = false;
  $('#result').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  $('#result-title').focus?.({ preventScroll: true });
}

showStep(0);
