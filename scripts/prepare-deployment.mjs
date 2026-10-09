import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
// Release decisions remain an owner/marketing review process; no environment-specific build block.
const root = resolve(import.meta.dirname, '..');
const sourceOrigin = 'https://www.benefitswithveterans.com';
const configured = process.env.SITE_URL?.trim() || sourceOrigin;
const url = new URL(configured);
if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
  throw new Error('SITE_URL must be a clean HTTPS origin.');
}
const isPreview = process.env.VERCEL_ENV === 'preview' || process.env.VERCEL_TARGET_ENV === 'preview';
const robots = isPreview ? 'noindex,nofollow' : 'index,follow';
// Normalize from each page's current canonical so repeated builds never retain an old origin.
for (const file of ['dist/index.html', 'dist/veterans/index.html']) {
  const path = resolve(root, file);
  let content = readFileSync(path, 'utf8');
  const canonical = content.match(/<link rel="canonical" href="([^"]+)">/);
  if (!canonical) throw new Error(`Missing canonical URL in ${file}`);
  const previousOrigin = new URL(canonical[1]).origin;
  content = content.replaceAll(previousOrigin, url.origin)
    .replace(/<meta name="robots" content="[^"]*">/, `<meta name="robots" content="${robots}">`);
  writeFileSync(path, content);
}
// These small generated files are deterministic for every environment and build invocation.
writeFileSync(resolve(root, 'dist/robots.txt'), isPreview
  ? 'User-agent: *\nDisallow: /\n'
  : `User-agent: *\nAllow: /\nSitemap: ${url.origin}/sitemap.xml\n`);
writeFileSync(resolve(root, 'dist/sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${url.origin}/</loc></url><url><loc>${url.origin}/veterans/</loc></url></urlset>\n`);
console.log(JSON.stringify({ prepared: true, canonical_origin: url.origin, environment: isPreview ? 'preview' : 'non-preview' }));
