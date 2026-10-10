import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, statSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const read=p=>readFileSync(resolve(root,p),'utf8');
const css=read('dist/styles.css');
const luminance=hex=>hex.match(/\w\w/g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>{const [x,y]=[luminance(a),luminance(b)].sort((a,b)=>b-a);return(x+.05)/(y+.05)};
test('brand typography and images are self-hosted; marks work on both backgrounds',()=>{
 for(const f of ['brand-mark-dark.svg','brand-mark-light.svg','favicon.svg']) assert.match(read('dist/'+f),/viewBox="0 0 64 64"/);
 assert.match(css,/font-display:swap/);assert.match(css,/prefers-reduced-motion:reduce/);
 for(const file of ['dist/index.html','dist/veterans/index.html']){
  const html=read(file);assert.match(html,/family-640.webp 640w/);assert.match(html,/loading="lazy"/);
  assert.doesNotMatch(html,/fonts.googleapis|fonts.gstatic|<iframe|<script[^>]+src=/);
  assert.match(html,/Illustrative photo; not a customer testimonial/);
  assert.match(html,/brand-mark-light.svg/);
 }
});
test('core brand text combinations meet AA normal text contrast',()=>{
 for(const [fg,bg] of [['0B1931','F7F3EB'],['344156','F7F3EB'],['586271','F7F3EB'],['FFFFFF','B73545'],['C7A86D','0B1931'],['6f5732','F7F3EB'],['c0c8d4','0B1931']]) assert(contrast(fg,bg)>=4.5,`${fg} on ${bg}: ${contrast(fg,bg)}`);
});
test('mobile image plus typography budget stays smaller than original family image',()=>{
 const files=['dist/family-640.webp','dist/fonts/newsreader-latin.woff2','dist/fonts/manrope-latin.woff2'];
 const bytes=files.reduce((sum,f)=>sum+statSync(resolve(root,f)).size,0);
 assert(bytes<224734,`${bytes} bytes exceeds original family image`);
 assert(statSync(resolve(root,'dist/anvar-portrait.webp')).size<60417);
});

test('agency identity replaces personal marketing while producer compliance remains',()=>{
 for(const file of ['dist/index.html','dist/veterans/index.html']){
  const html=read(file);
  assert.doesNotMatch(html,/anvar-portrait|Hi, I’m Anvar|Meet Anvar|anvar@benefits/);
  assert.match(html,/class="agency-panel"/);
  assert.match(html,/Producer disclosure: Anvar Baltakhojayev · NPN 22327730/);
  assert.match(html,/info@benefitswithveterans.com/);
 }
});

test('budget amounts are clearly labeled planning prompts, not quoted policy prices',()=>{
 for(const file of ['dist/index.html','dist/veterans/index.html']){
  const html=read(file);
  assert.match(html,/What monthly budget would feel comfortable\?/);
  assert.match(html,/Planning budgets, not insurance quotes\. Your available coverage and actual premium depend on your application and the policy offered\./);
  for(const amount of ['$25–$50','$50–$100','$100–$200','$200+']) assert(html.includes(amount));
  assert.equal((html.match(/\$25/g)||[]).length,1);
  assert.doesNotMatch(html,/<button|<select|<input|data-budget|[?&]budget=/);
 }
});


test('questionnaire preserves accessible five-step, consent and privacy contracts',()=>{
 const html=read('dist/find-coverage/index.html');
 const js=read('dist/questionnaire.mjs');
 assert.equal((html.match(/<fieldset data-step=/g)||[]).length,4);
 assert.match(html,/id="intake-confirmation" hidden/);
 assert.match(html,/name="contactConsent" required/);
 assert.match(html,/name="marketingConsent"/);
 assert.doesNotMatch(html,/<input[^>]*name="marketingConsent"[^>]*checked/);
 for(const range of ['18-39','40-59','60-70','71-85','86+']) assert(html.includes(`value="${range}"`));
 assert.match(html,/id="coverage-form" novalidate hidden/);
 assert.match(html,/Planning budgets, not insurance quotes/);
 assert.match(html,/routing|route your request only/);
 assert.match(js,/Idempotency-Key/);
 assert.match(js,/data\?\.accepted !== true/);
 assert.match(js,/receipt/);
 assert.doesNotMatch(js,/localStorage|sessionStorage|console\./);
 assert.match(js,/fictional: config.mode === 'fictional_preview' && checked\('fictional'\)/);
 assert.match(js,/form\.reset\(\)/);
});
