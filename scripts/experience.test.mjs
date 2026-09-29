import test from 'node:test';
import assert from 'node:assert/strict';
import { coverageExample, hypotheticalCredit, annuityStages } from '../dist/experience.mjs';

test('existing coverage and earmarked savings both offset entered responsibilities', () => {
  const result = coverageExample(100000, 60000, 20000);
  assert.equal(result.gap, 20000);
  assert.equal(result.existingPercent, 60);
  assert.equal(result.savingsPercent, 20);
});

test('resources above entered needs never create a negative gap or overflowing chart', () => {
  for (const scenario of [[50000,100000,20000],[50000,25000,100000],[50000,50000,0]]) {
    const result = coverageExample(...scenario);
    assert.equal(result.gap, 0);
    assert.equal(result.existingPercent + result.savingsPercent, 100);
  }
});

test('zero needs and invalid values stay finite without a misleading negative result', () => {
  for (const scenario of [[0,0,0],[0,60000,20000],[-1,NaN,Infinity]]) {
    const result = coverageExample(...scenario);
    assert.equal(result.gap, 0);
    assert.equal(result.existingPercent, 0);
    assert.equal(result.savingsPercent, 0);
    assert(Object.values(result).every(Number.isFinite));
  }
  assert.equal(coverageExample(15000,0,5000).gap, 10000);
});

test('range extremes keep model within documented input bounds', () => {
  const result = coverageExample(500000,0,0);
  assert.equal(result.gap, 500000);
  assert.equal(result.existingPercent + result.savingsPercent, 0);
  assert.equal(coverageExample(9999999,0,0).gap, 500000);
});

test('IUL teaching scenarios apply a cap and floor, not an unrestricted index return', () => {
  assert.equal(hypotheticalCredit(12), 8);
  assert.equal(hypotheticalCredit(0), 0);
  assert.equal(hypotheticalCredit(-15), 0);
  assert.equal(hypotheticalCredit(4), 4);
  assert.equal(hypotheticalCredit(NaN), 0);
});

test('each annuity stage includes a substantive question and limits', () => {
  assert.equal(annuityStages.length, 3);
  annuityStages.forEach(stage => {
    assert(stage.title && stage.label && stage.copy && stage.question.endsWith('?”'));
  });
  assert.match(annuityStages[1].copy, /limited or unavailable/);
  assert.match(annuityStages[2].copy, /purchasing power/);
});
