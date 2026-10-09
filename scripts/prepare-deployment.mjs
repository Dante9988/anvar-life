import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
// Review-only release guard. Remove only after explicit owner and required carrier approval.
// Branch-level Vercel previews remain available; production builds must not publish this draft.
if (process.env.VERCEL_ENV === 'production' || process.env.VERCEL_TARGET_ENV === 'production') {
  throw new Error('Production release is on hold pending owner and required marketing approval.');
}
const root = resolve(import.meta.dirname, '..');
const sourceOrigin = 'https://www.benefitswithveterans.com';
const configured = process.env.SITE_URL?.trim() || sourceOrigin;
const url = new URL(configured);
if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
  throw new Error('SITE_URL must be a clean HTTPS origin.');
}
for (const file of ['dist/index.html', 'dist/veterans/index.html', 'dist/robots.txt', 'dist/sitemap.xml']) {
  const path = resolve(root, file);
  let content = readFileSync(path, 'utf8').replaceAll(sourceOrigin, url.origin);
  if (process.env.VERCEL_ENV === 'preview') {
    if (file.endsWith('.html')) content = content.replace('content="index,follow"', 'content="noindex,nofollow"');
    if (file.endsWith('robots.txt')) content = 'User-agent: *\nDisallow: /\n';
  }
  writeFileSync(path, content);
}
console.log(JSON.stringify({ prepared: true, canonical_origin: url.origin, production_release: 'blocked pending approval' }));
