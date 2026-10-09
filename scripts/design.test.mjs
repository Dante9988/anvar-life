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

test('portrait dimensions follow its responsive editorial crop instead of a fixed HTML height',()=>{
 assert.match(css,/\.portrait-wrap img\{[^}]*width:100%;height:auto;aspect-ratio:1\/1\.13/);
});
