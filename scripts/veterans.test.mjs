import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, cpSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
const root=resolve(import.meta.dirname,'..');
const ethos='https://app.ethoslife.com/partner/780a6/q/goals';
const booking='https://calendar.app.google/PF12N8i49QaFAV7o9';
for(const file of ['dist/index.html','dist/veterans/index.html']){
 const html=readFileSync(resolve(root,file),'utf8');
 test(`${file}: all conversion links preserve exact destinations`,()=>{
  const anchors=[...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  const rates=anchors.filter(m=>/CHECK MY|SEE MY PRICE|Check my rate/.test(m[2]));
  assert(rates.length>=6);
  for(const m of rates) assert.equal(m[1],ethos);
  const calls=anchors.filter(m=>/TALK TO ANVAR|SPEAK WITH ANVAR|CONSULTATION|Talk to Anvar|Ask Anvar|Book a free/.test(m[2]));
  assert(calls.length>=7);
  for(const m of calls) assert.equal(m[1],booking);
  for(const m of anchors) if(/^https:/.test(m[1])) assert([ethos,booking].includes(m[1]));
 });
 test(`${file}: reassuring conversion structure works without JavaScript`,()=>{
  for(const text of ['Protect Your Family.','Check Your Life Insurance Rate Today.','Free quote. No obligation to buy.','How Much Could Life Insurance Cost You?','Looking for Final','CHECK MY OPTIONS','People First. Always.']) assert(html.includes(text));
  assert.match(html,/class="mobile-actions" aria-label="Quick actions"/);
  assert.equal((html.match(/<details>/g)||[]).length,5);
  assert.doesNotMatch(html,/<script[^>]+src=|onclick=|target="_blank"/);
 });
 test(`${file}: product limitations and independence stay visible`,()=>{
  assert.match(html,/not affiliated with or endorsed by/);
  assert.match(html,/not a guarantee of coverage or final pricing/);
  assert.match(html,/graded or modified benefits/);
  assert.match(html,/0% index-crediting floor does not prevent policy charges/);
  assert.doesNotMatch(html,/\$25|\$1[ ,]?000[ ,]?000|pre-approved|guaranteed approval|calendly/i);
 });
}
test('production guard blocks both Vercel production environment variables',()=>{
 for(const key of ['VERCEL_ENV','VERCEL_TARGET_ENV']) {
  const result=spawnSync(process.execPath,['scripts/prepare-deployment.mjs'],{cwd:root,env:{...process.env,[key]:'production'},encoding:'utf8'});
  assert.notEqual(result.status,0); assert.match(result.stderr,/Production release is on hold/);
 }
});
test('isolated preview build disables indexing and preserves canonical business domain',()=>{
 const temp=mkdtempSync(join(tmpdir(),'bwv-preview-'));
 try{cpSync(resolve(root,'dist'),join(temp,'dist'),{recursive:true});cpSync(resolve(root,'scripts'),join(temp,'scripts'),{recursive:true});
 const result=spawnSync(process.execPath,['scripts/prepare-deployment.mjs'],{cwd:temp,env:{...process.env,VERCEL_ENV:'preview'},encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 assert.match(readFileSync(join(temp,'dist/index.html'),'utf8'),/content="noindex,nofollow"/);
 assert.match(readFileSync(join(temp,'dist/index.html'),'utf8'),/rel="canonical" href="https:\/\/www.benefitswithveterans.com\/"/);
 assert.equal(readFileSync(join(temp,'dist/robots.txt'),'utf8'),'User-agent: *\nDisallow: /\n');
 }finally{rmSync(temp,{recursive:true,force:true});}
});
