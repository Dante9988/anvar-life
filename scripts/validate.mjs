import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
for (const file of ['dist/index.html','dist/veterans/index.html']) {
 const html = readFileSync(resolve(root,file),'utf8');
 assert.match(html, /<html lang="en">/);
 assert.equal((html.match(/<h1[ >]/g)||[]).length,1);
 assert.match(html,/name="viewport"/);
 assert.match(html,/class="skip-link" href="#main"/);
 assert.match(html,/rel="canonical" href="https:\/\//);
 assert.match(html,/NPN 22327730/);
 assert.match(html,/anvar@benefitswithveterans\.com/);
 assert.doesNotMatch(html,/calendly|xadja35|<iframe|<form|<input|\$25|pre-approved/i);
 const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(ids).size,ids.length,'Duplicate IDs');
 for (const m of html.matchAll(/href="#([^"]+)"/g)) assert(ids.includes(m[1]),`Missing anchor ${m[1]}`);
 for (const m of html.matchAll(/(?:src|href)="(\/[^"#]+)"/g)) {
  const asset=resolve(root,'dist'+m[1]);
  assert(existsSync(asset),`Missing asset ${m[1]}`);
 }
 for (const m of html.matchAll(/<img\b[^>]+>/g)) assert(/alt="[^"]*"/.test(m[0]),'Image missing alt');
 for (const m of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) { assert(m[0].includes('application/ld+json')); JSON.parse(m[1]); }
}
const config=JSON.parse(readFileSync(resolve(root,'vercel.json')));
assert.equal(config.outputDirectory,'dist');
assert.equal(config.buildCommand,'npm run build');
assert.match(JSON.stringify(config.headers),/form-action 'none'/);
console.log('Static integrity, accessibility hooks, branding, safety and Vercel checks passed.');
