import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAttribution, questionnaireHref } from '../dist/attribution.mjs';
test('campaign attribution captures only bounded allowlisted values', () => {
  assert.deepEqual(normalizeAttribution('?utm_source=newsletter&utm_medium=email&utm_campaign=fall-2026&utm_term=family&utm_content=hero&arbitrary=secret'), {source:'newsletter',medium:'email',campaign:'fall-2026',term:'family',content:'hero'});
  assert.deepEqual(normalizeAttribution('?utm_source=one&utm_source=two&utm_campaign=valid'), {campaign:'valid'});
  assert.deepEqual(normalizeAttribution(`?utm_source=${'a'.repeat(101)}`), {});
  assert.deepEqual(normalizeAttribution('x'.repeat(2049)), {});
});
test('contact information, URLs and malformed campaign parameters are dropped', () => {
  for (const value of ['jane@example.com','415-555-0123','415 555 0123','phone-jane','https://example.com','example.com','%broken','name%0Atest','123456789','ssn_123']) {
    assert.deepEqual(normalizeAttribution(`?utm_source=${encodeURIComponent(value)}`), {}, value);
  }
  assert.deepEqual(normalizeAttribution('?utm_source=%E0%A4%A'), {});
});
test('questionnaire links never forward unknown parameters or a raw URL', () => {
  assert.equal(questionnaireHref({source:'newsletter',campaign:'fall-2026',secret:'private'}), '/find-coverage/?utm_source=newsletter&utm_campaign=fall-2026');
  assert.equal(questionnaireHref({source:'jane@example.com'}), '/find-coverage/');
});
