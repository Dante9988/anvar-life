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
    scrollIntoView() { this.scrolls++; },
    focus() { this.focused = true; },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    ...properties,
  };
}

function setup({ search = '', videoSource = '', state = 'WV' } = {}) {
  const nodes = new Map();
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, element());
    return nodes.get(selector);
  };
  const cta = element({ href: '#watch' });
  const firstInput = element();
  const steps = Array.from({ length: 5 }, (_, i) => element({ dataset: { step: String(i + 1) } }));
  node('.video-shell').dataset.videoSrc = videoSource;
  node('.funnel-video').hidden = true;
  node('#start-review').disabled = true;
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
        if (selector === '[data-review-cta]') return [cta];
        if (selector.startsWith('.quiz-step:not')) return [firstInput];
        return [];
      },
    },
    location: { search }, URL, URLSearchParams,
    matchMedia: () => ({ matches: true }),
    FormData: class { get(key) { return formAnswers[key] || null; } },
    sessionStorage: { setItem: (key, value) => stored.set(key, value) },
  });
  runInContext(source, context);
  return { node, cta, steps, context, stored };
}

test('normal visitors cannot bypass the video through repeated CTAs', () => {
  const { node, cta } = setup();
  assert.equal(node('#start-review').disabled, true);
  assert.equal(cta.href, '#watch');
  cta.click();
  node('#start-review').click();
  assert.equal(node('#review').hidden, true);
});

test('preview mode unlocks the repeated CTA and displays the questionnaire', () => {
  const { node, cta } = setup({ search: '?preview=1' });
  assert.equal(node('#start-review').disabled, false);
  assert.equal(cta.href, '#review');
  cta.click();
  assert.equal(node('#review').hidden, false);
  assert.equal(node('#result').hidden, true);
});

test('configured video remains locked until completion even on a preview URL', () => {
  const { node, cta } = setup({ search: '?preview=1', videoSource: '/veterans/overview.mp4' });
  assert.equal(node('.funnel-video').hidden, false);
  assert.equal(node('.video-placeholder').hidden, true);
  assert.equal(node('#start-review').disabled, true);
  node('.funnel-video').listeners.ended();
  assert.equal(node('#start-review').disabled, false);
  assert.equal(cta.href, '#review');
});

test('completed visitors return to their result, not a reopened questionnaire', () => {
  const { node, cta, context } = setup({ search: '?preview=1' });
  cta.click();
  runInContext('finishReview()', context);
  assert.equal(cta.href, '#result');
  assert.equal(cta.textContent, 'Continue to my call options');
  cta.click();
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
  assert.equal(stored.has('veteran-review-summary'), true);
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
