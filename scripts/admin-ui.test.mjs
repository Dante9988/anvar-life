import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const root=resolve('dist');
test('private dashboard assets avoid browser PII persistence and unsafe rendering',async()=>{
 const js=await readFile(resolve(root,'admin/assets/dashboard.mjs'),'utf8');
 assert.doesNotMatch(js,/localStorage\.|sessionStorage\.|document\.cookie\s*=/);
 assert.match(js,/X-CSRF-Token/);assert.match(js,/credentials:'same-origin'/);assert.match(js,/cache:'no-store'/);
 assert.match(js,/function clearPrivateState/);assert.match(js,/state\.detailId/);assert.match(js,/state\.loadId/);
 const html=await readFile(resolve(root,'admin/leads/index.html'),'utf8');
 assert.match(html,/noindex,nofollow,noarchive/);assert.match(html,/aria-live="polite"/);
});
