import { coverageExample, hypotheticalCredit, annuityStages } from './experience.mjs';

const $ = selector => document.querySelector(selector);
const all = selector => [...document.querySelectorAll(selector)];
const root = document.documentElement;
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const prefs = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* Device storage is optional. */ } }
};

// Navigation stays usable by keyboard and closes without moving focus unexpectedly.
const menu = $('.menu-toggle');
const navigation = $('#main-nav');
const closeMenu = () => {
  navigation.classList.remove('open');
  menu.setAttribute('aria-expanded', 'false');
  menu.setAttribute('aria-label', 'Open navigation');
};
menu.addEventListener('click', () => {
  const open = navigation.classList.toggle('open');
  menu.setAttribute('aria-expanded', String(open));
  menu.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
});
navigation.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && navigation.classList.contains('open')) {
    closeMenu();
    menu.focus();
  }
});
window.addEventListener('resize', () => { if (window.innerWidth > 900) closeMenu(); });

// Dark is the design default; visitors can choose the display that suits them.
const themeButton = $('.theme-toggle');
function setTheme(theme) {
  root.dataset.theme = theme === 'light' ? 'light' : 'dark';
  themeButton.setAttribute('aria-label', root.dataset.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  themeButton.title = themeButton.getAttribute('aria-label');
  $('meta[name="theme-color"]').content = root.dataset.theme === 'dark' ? '#080d12' : '#f5f8f8';
}
setTheme(prefs.get('anvar-theme') || 'dark');
themeButton.addEventListener('click', () => {
  setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark');
  prefs.set('anvar-theme', root.dataset.theme);
});

// One control pauses every ambient animation. OS reduced-motion preference wins.
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const motionButton = $('.motion-toggle');
let manualPause = prefs.get('anvar-motion') === 'paused';
function updateMotion() {
  const paused = manualPause || reducedMotion.matches;
  root.classList.toggle('motion-paused', paused);
  motionButton.setAttribute('aria-pressed', String(paused));
  motionButton.disabled = reducedMotion.matches;
  $('.motion-label').textContent = reducedMotion.matches ? 'Reduced motion' : paused ? 'Resume motion' : 'Pause motion';
  $('.pause-symbol').textContent = paused ? '▷' : 'Ⅱ';
  motionButton.title = reducedMotion.matches ? 'Reduced motion follows your device preference' : '';
}
motionButton.addEventListener('click', () => {
  manualPause = !manualPause;
  prefs.set('anvar-motion', manualPause ? 'paused' : 'on');
  updateMotion();
});
reducedMotion.addEventListener('change', updateMotion);
updateMotion();

// A short, self-directed learning journey. No score, quote, or product recommendation.
const topics = ['life', 'iul', 'annuity'];
const topicNames = { life: 'life insurance', iul: 'IUL', annuity: 'annuities' };
const visited = new Set(['life']);
const tabs = all('[role="tab"]');
let currentTopic = 'life';
function selectTopic(topic, focus = false) {
  if (!topics.includes(topic)) return;
  currentTopic = topic;
  visited.add(topic);
  topics.forEach((name, index) => {
    const active = name === topic;
    const tab = $('#tab-' + name);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    $('#panel-' + name).hidden = !active;
    all('.progress-marks i')[index].classList.toggle('seen', visited.has(name));
  });
  $('#explored-count').textContent = String(visited.size);
  $('#explorer-summary').textContent = visited.size === 3
    ? 'Three concepts explored. Bring your questions to our call.'
    : 'One useful question is a good beginning.';
  const next = topics[(topics.indexOf(topic) + 1) % topics.length];
  $('#next-topic').textContent = (visited.has(next) ? 'Revisit ' : 'Explore ') + topicNames[next];
  if (focus) $('#tab-' + topic).focus();
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectTopic(topics[index]));
  tab.addEventListener('keydown', event => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      selectTopic(topics[next], true);
    }
  });
});
$('#next-topic').addEventListener('click', () => {
  selectTopic(topics[(topics.indexOf(currentTopic) + 1) % topics.length], true);
});
all('[data-explore]').forEach(button => button.addEventListener('click', () => {
  selectTopic(button.dataset.explore);
  $('#explore').scrollIntoView({ behavior: root.classList.contains('motion-paused') ? 'instant' : 'smooth' });
  $('#tab-' + button.dataset.explore).focus({ preventScroll: true });
}));

// Inputs never leave the page, enter a URL, or persist across page loads.
function updateCoverage() {
  const values = {};
  ['needs', 'existing', 'savings'].forEach(name => {
    const input = $('#' + name + '-range');
    const value = Number(input.value);
    values[name] = value;
    $('#' + name + '-output').textContent = money.format(value);
    input.setAttribute('aria-valuetext', money.format(value));
    input.style.setProperty('--fill', String(value / Number(input.max) * 100) + '%');
  });
  const result = coverageExample(values.needs, values.existing, values.savings);
  $('#life-gap').textContent = money.format(result.gap);
  $('#life-result-copy').textContent = result.needs === 0
    ? 'No responsibilities are entered in this example. Review the full picture before making any coverage decision.'
    : result.gap === 0
      ? 'These resources meet the amount entered. That does not establish that you have excess coverage or should reduce it.'
      : 'Existing coverage and earmarked savings offset part of these example needs. The difference is a conversation starter.';
  $('#existing-bar').style.width = result.existingPercent + '%';
  $('#savings-bar').style.width = result.savingsPercent + '%';
  $('.coverage-track').setAttribute('aria-label', result.needs === 0
    ? 'No example responsibilities entered'
    : 'Existing coverage and savings cover ' + Math.round(result.existingPercent + result.savingsPercent) + ' percent of example needs');
}
all('input[type="range"]').forEach(input => input.addEventListener('input', updateCoverage));
updateCoverage();

const indexButtons = all('[data-index]');
indexButtons.forEach(button => button.addEventListener('click', () => {
  const change = Number(button.dataset.index);
  const credited = hypotheticalCredit(change);
  indexButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  $('#iul-credit').textContent = credited + '%';
  $('#credit-change').textContent = credited + '%';
  $('#index-change').textContent = (change > 0 ? '+' : '') + change + '%';
  $('#iul-explanation').textContent = change > 8
    ? 'In this example, the 8% cap limits the interest credit even though the index rose 12%.'
    : change < 0
      ? 'In this example, the crediting floor produces 0% interest. Policy charges still apply, so cash value can decrease.'
      : 'In this example, a flat index produces 0% interest. Policy charges still apply, so cash value can decrease.';
}));

const stageButtons = all('[data-stage]');
stageButtons.forEach(button => button.addEventListener('click', () => {
  const index = Number(button.dataset.stage);
  const stage = annuityStages[index];
  stageButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  $('#annuity-stage-label').textContent = stage.label;
  $('#annuity-stage-title').textContent = stage.title;
  $('#annuity-stage-copy').textContent = stage.copy;
  $('#annuity-question').textContent = stage.question;
  all('.timeline-graphic span').forEach((node, i) => node.classList.toggle('active', i <= index));
  all('.timeline-graphic i').forEach((node, i) => node.classList.toggle('active', i < index));
}));
