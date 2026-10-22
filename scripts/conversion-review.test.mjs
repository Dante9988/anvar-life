import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {validateReview, REVIEW_PRODUCTS, REVIEW_STATES} from '../dist/review/callback.mjs';
const root=resolve(import.meta.dirname,'..');
const read=p=>readFileSync(resolve(root,p),'utf8');
const paths=['final-expense','term-life','living-benefits'];
const valid={name:'Fictional Example',phone:'202-555-0142',state:'CA',product:'term_life',contactConsent:true,fictional:true};

test('all three distinct product drafts have accessible structure, named agent and prominent VA separation',()=>{
 const titles=new Set();
 for(const path of paths){
  const html=read(`dist/review/${path}/index.html`);
  assert.match(html,/<html lang="en">/); assert.equal((html.match(/<h1>/g)||[]).length,1);
  titles.add(html.match(/<h1>(.*?)<\/h1>/)[1]);
  assert.match(html,/<meta name="robots" content="noindex,nofollow,noarchive">/);
  assert.match(html,/class="skip-link" href="#main"/);
  const disclaimer=html.indexOf('Not affiliated with or endorsed by the U.S. Department of Veterans Affairs');
  assert(disclaimer>0 && disclaimer<html.indexOf('<h1>'));
  assert.match(html,/Anvar Baltakhojayev/); assert.match(html,/NPN 22327730/);
  assert.match(html,/https:\/\/calendar.app.google\/PF12N8i49QaFAV7o9/);
  assert.match(html,/A direct-call number is pending verification/);
  assert.doesNotMatch(html,/href="tel:|\$37|guaranteed approval|exclusive veteran|<iframe|<img[^>]*anvar-portrait|marketingConsent/);
  assert.match(html,/<fieldset id="callback-fields" disabled>/);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]); assert.equal(ids.length,new Set(ids).size);
  for(const m of html.matchAll(/href="#([^"]+)"/g)) assert(ids.includes(m[1]),`Missing ${m[1]}`);
  for(const m of html.matchAll(/(?:src|href)="(\/[^"#]+)"/g)) assert(existsSync(resolve(root,'dist'+m[1])),`Missing asset ${m[1]}`);
  assert.match(html,new RegExp(`data-source-path="/review/${path}/"`));
 }
 assert.equal(titles.size,3);
});

test('review validator requires minimal contact, state, product, consent and fictional confirmation',()=>{
 assert.equal(validateReview(valid),null);
 for(const product of REVIEW_PRODUCTS) assert.equal(validateReview({...valid,product}),null);
 for(const phone of ['2025550100','2025550199','+1 (202) 555-0142']) assert.equal(validateReview({...valid,phone}),null);
 for(const [field,value] of [['name',' '],['name','a'.repeat(81)],['phone','2025550200'],['phone','2025550100abc'],['phone','4155550100'],['state','XX'],['product','retirement'],['contactConsent',false],['contactConsent','true'],['fictional',false]]) assert.equal(validateReview({...valid,[field]:value}).field,field);
 assert.equal(REVIEW_STATES.length,51);
});

test('prototype cannot transmit, persist, track or create a consent receipt',()=>{
 const js=read('dist/review/callback.mjs');
 assert.doesNotMatch(js,/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|localStorage|sessionStorage|document\.cookie|console\.|location\.(?:href|assign)|\/api\//);
 assert.match(js,/event\.preventDefault\(\)/);assert.match(js,/form\.reset\(\)/);
 assert.match(js,/pagehide/);assert.match(js,/pageshow/);
 for(const path of paths){
  const html=read(`dist/review/${path}/index.html`);
  assert.doesNotMatch(html,/<form[^>]*(?:action=|method=)/);
  for(const key of ['contactConsent','fictional']) assert.match(html,new RegExp(`name="${key}" required`));
  assert.doesNotMatch(html,/<input[^>]*checked/);
 }
});

test('existing live pages and sitemap do not promote unapproved review routes',()=>{
 for(const file of ['dist/index.html','dist/veterans/index.html','dist/find-coverage/index.html','dist/sitemap.xml']) assert.doesNotMatch(read(file),/\/review\//);
});

test('exact review branch disables Vercel Git deployments without changing other branches',()=>{
 const config=JSON.parse(read('vercel.json'));
 assert.deepEqual(config.git.deploymentEnabled,{'review/single-agent-conversion':false});
 assert.equal(config.buildCommand,'npm run build');
 assert.match(JSON.parse(read('package.json')).scripts.build,/^node scripts\/prepare-deployment\.mjs/);
 const result=spawnSync(process.execPath,['scripts/prepare-deployment.mjs'],{cwd:root,env:{...process.env,VERCEL:'1'},encoding:'utf8'});
 assert.notEqual(result.status,0);assert.match(result.stderr,/REVIEW_ONLY/);
});
