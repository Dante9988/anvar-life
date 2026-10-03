import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const source = readFileSync(new URL('../dist/veterans/veterans.js', import.meta.url), 'utf8');

// Dependency-free behavior harness. Static checks verify actual markup targets;
// the live browser pass verifies layout and real input interaction separately.
function element(properties = {}) {
  return {
    hidden: false, disabled: false, style: {}, dataset: {}, listeners: {},
    textContent: '', href: '', scrolls: 0, focused: false,
    addEventListener(type, fn) { this.listeners[type] = fn; },
    click() { if (!this.disabled) this.listeners.click?.({ preventDefault() {} }); },
    scrollIntoView(options) { this.scrolls++; this.scrollOptions = options; },
    focus() { this.focused = true; },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    ...properties,
  };
}

function setup({ search = '', state = 'WV', reducedMotion = true } = {}) {
  const nodes = new Map();
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, element());
    return nodes.get(selector);
  };
  const cta = element({ href: 'https://calendly.com/anvar-life/15min' });
  const firstInput = element();
  const steps = Array.from({ length: 5 }, (_, i) => element({ dataset: { step: String(i + 1) } }));
  node('#start-review').hidden = true;
  node('#review').hidden = true;
  node('#result').hidden = true;
  const formAnswers = { state, service: 'Veteran', age: '55–64', coverage: '$50,000–$100,000', budget: '$75–$125' };
  const selected = { goal: ['Income and family protection'], existing: ['SGLI or VGLI'] };
  node('#veteran-review').querySelectorAll = selector => {
    const name = selector.match(/name="([^"]+)"/)?.[1];
    return (selected[name] || []).map(value => ({ value }));
  };
  const stored = new Map();
  const context = createContext({
    document: {
      querySelector: node,
      querySelectorAll(selector) {
        if (selector === '.quiz-step') return steps;
        if (selector === '[data-booking-cta]') return [cta, node('#book-call')];
        if (selector.startsWith('.quiz-step:not')) return [firstInput];
        return [];
      },
    },
    location: { search }, URL, URLSearchParams,
    matchMedia: () => ({ matches: reducedMotion }),
    FormData: class { get(key) { return formAnswers[key] || null; } },
    sessionStorage: { setItem: (key, value) => stored.set(key, value) },
  });
  runInContext(source, context);
  return { node, cta, steps, context, stored, firstInput };
}

test('normal visitors can immediately book or open the optional review', () => {
  const { node, cta } = setup();
  assert.equal(cta.href, 'https://calendly.com/anvar-life/15min');
  assert.equal(node('#start-review').hidden, false);
  node('#start-review').click();
  assert.equal(node('#review').hidden, false);
});

test('legacy preview URLs no longer change access to booking or review', () => {
  const { node, cta } = setup({ search: '?preview=1' });
  assert.equal(cta.href, 'https://calendly.com/anvar-life/15min');
  node('#start-review').click();
  assert.equal(node('#review').hidden, false);
});

test('completed visitors return to their result while booking stays direct', () => {
  const { node, cta, context } = setup();
  node('#start-review').click();
  runInContext('finishReview()', context);
  assert.equal(cta.href, 'https://calendly.com/anvar-life/15min');
  node('#start-review').click();
  assert.equal(node('#review').hidden, true);
  assert.equal(node('#result').hidden, false);
  assert.equal(node('#result-title').focused, true);
});

test('booking attribution keeps UTM parameters without leaking answers or preview flags', () => {
  const { node, context, stored } = setup({ search: '?preview=1&utm_source=facebook&utm_campaign=family&state=WV&age=60' });
  runInContext('finishReview()', context);
  const booking = new URL(node('#book-call').href);
  assert.equal(booking.origin + booking.pathname, 'https://calendly.com/anvar-life/15min');
  assert.deepEqual([...booking.searchParams.keys()], ['utm_source', 'utm_campaign']);
  assert.equal(booking.searchParams.get('utm_source'), 'facebook');
  assert.equal(stored.size, 0);
  assert.match(node('#result-copy').textContent, /do not determine approval or price/);
});

test('out-of-state results still require licensing and availability confirmation', () => {
  const { node, context } = setup({ state: 'OTHER' });
  runInContext('finishReview()', context);
  assert.match(node('#result-copy').textContent, /licensing and availability check/);
  assert.match(node('#result-copy').textContent, /does not guarantee/);
});

test('required fields and unselected coverage priorities fail validation', () => {
  const { steps, context } = setup();
  steps[0].querySelectorAll = () => [{ type: 'radio', name: 'service' }];
  assert.equal(runInContext('stepIsValid(steps[0])', context), false);
  steps[0].querySelector = () => ({ checked: true });
  assert.equal(runInContext('stepIsValid(steps[0])', context), true);
  assert.equal(runInContext('stepIsValid(steps[2])', context), false);
  assert.equal(runInContext('stepIsValid(steps[3])', context), false);
});


test('every visible booking CTA is a real link before JavaScript runs', () => {
  const html = readFileSync(new URL('../dist/veterans/index.html', import.meta.url), 'utf8');
  const bookingTags = [...html.matchAll(/<a\b[^>]*data-booking-cta[^>]*>/g)].map(match => match[0]);
  assert.equal(bookingTags.length, 5);
  bookingTags.forEach(tag => {
    assert.match(tag, /href="https:\/\/calendly\.com\/anvar-life\/15min"/);
    assert.doesNotMatch(tag, /disabled|aria-disabled|href="#/);
    assert.match(tag, /rel="noopener noreferrer"/);
  });
  assert.match(html, /id="start-review"[^>]*hidden/);
  assert.doesNotMatch(html, /<video\b|href="#watch"|data-video-src|unlock-status/);
});

test('UTM handoff works before starting or completing the questionnaire', () => {
  const { cta, node } = setup({ search: '?utm_source=facebook&utm_medium=paid&utm_campaign=family&utm_content=first&utm_term=coverage&email=private&preview=1' });
  const params = new URL(cta.href).searchParams;
  assert.deepEqual([...params.keys()], ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']);
  assert.equal(params.get('utm_campaign'), 'family');
  assert.equal(cta.href, node('#book-call').href);
  assert.equal(node('#review').hidden, true);
});

test('starting and repeatedly opening the review preserves progress and focuses an input', () => {
  const { node, context, firstInput } = setup();
  node('#start-review').click();
  assert.equal(firstInput.focused, true);
  runInContext('showStep(2)', context);
  node('#start-review').click();
  assert.equal(runInContext('currentStep', context), 2);
  assert.equal(node('#step-label').textContent, 'Step 3 of 5');
});

test('invalid input shows the error without advancing or changing the booking link', () => {
  const { node, cta, steps, context } = setup();
  steps[0].querySelectorAll = () => [{ type: 'radio', name: 'service' }];
  node('#next-step').click();
  assert.equal(node('#form-error').hidden, false);
  assert.equal(runInContext('currentStep', context), 0);
  assert.equal(cta.href, 'https://calendly.com/anvar-life/15min');
});

test('Back is bounded at the first step and clears stale validation errors', () => {
  const { node, steps, context } = setup();
  runInContext('showStep(2)', context);
  node('#form-error').hidden = false;
  node('#back-step').click();
  assert.equal(node('#step-label').textContent, 'Step 2 of 5');
  assert.equal(node('#form-error').hidden, true);
  node('#back-step').click();
  node('#back-step').click();
  assert.equal(runInContext('currentStep', context), 0);
  assert.equal(node('#back-step').hidden, true);
  assert.equal(steps.filter(step => !step.hidden).length, 1);
});

test('required state, age, and health-conversation fields cannot be skipped', () => {
  const { steps, context } = setup();
  const state = { type: 'select-one', value: '' };
  steps[1].querySelectorAll = () => [state];
  assert.equal(runInContext('stepIsValid(steps[1])', context), false);
  state.value = 'OTHER';
  assert.equal(runInContext('stepIsValid(steps[1])', context), true);
  const health = { type: 'checkbox', checked: false };
  steps[4].querySelectorAll = () => [health];
  assert.equal(runInContext('stepIsValid(steps[4])', context), false);
  health.checked = true;
  assert.equal(runInContext('stepIsValid(steps[4])', context), true);
});

test('Enter prevents native form submission and uses the same validation path', () => {
  const { node, steps, context } = setup();
  let prevented = false;
  steps[0].querySelectorAll = () => [{ type: 'radio', name: 'service' }];
  node('#veteran-review').listeners.submit({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(node('#form-error').hidden, false);
  assert.equal(runInContext('currentStep', context), 0);
});

test('the five-step event flow reaches results without applying for or purchasing coverage', () => {
  const { node, steps, stored } = setup();
  steps.forEach(step => { step.querySelector = () => ({ checked: true }); });
  node('#start-review').click();
  for (let i = 0; i < 5; i++) node('#next-step').click();
  assert.equal(node('#step-percent').textContent, '100%');
  assert.equal(node('#review').hidden, true);
  assert.equal(node('#result').hidden, false);
  assert.match(node('#answer-summary').innerHTML, /Income and family protection/);
  assert.match(node('#result-copy').textContent, /do not determine approval or price/);
  assert.equal(stored.size, 0);
  node('#next-step').click();
  assert.equal(node('#result').hidden, false);
});

test('review scrolling respects reduced motion', () => {
  for (const reducedMotion of [true, false]) {
    const { node } = setup({ reducedMotion });
    node('#start-review').click();
    assert.equal(node('#review').scrollOptions.behavior, reducedMotion ? 'auto' : 'smooth');
  }
});

test('fresh page loads reset questionnaire progress and never restore saved answers', () => {
  const previous = setup();
  runInContext('finishReview()', previous.context);
  const fresh = setup();
  assert.equal(fresh.node('#result').hidden, true);
  assert.equal(fresh.node('#review').hidden, true);
  assert.equal(fresh.node('#step-label').textContent, 'Step 1 of 5');
  assert.equal(fresh.stored.size, 0);
});
