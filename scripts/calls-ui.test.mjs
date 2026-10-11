import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('call workspace preserves no-store no-local-PII and inactive external transports',async()=>{
  const js=await readFile('dist/admin/assets/calls.mjs','utf8'),html=await readFile('dist/admin/calls/index.html','utf8');
  assert.doesNotMatch(js,/localStorage\.|sessionStorage\.|document\.cookie\s*=|href=["']tel:/);
  assert.match(js,/X-CSRF-Token/);assert.match(js,/credentials: 'same-origin'/);assert.match(js,/cache: 'no-store'/);
  assert.match(js,/clearPrivateState/);assert.match(js,/state\.loadId/);assert.match(js,/state\.detailId/);
  assert.match(html,/noindex,nofollow,noarchive/);assert.match(js,/Awaiting reconciliation/);
  assert.match(js,/call\.do_not_contact/);assert.match(js,/call\.reply_received/);
});
