import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sourceOrigin = 'https://anvar-life-retirement.anvarxadja.chatgpt.site';

function deploymentOrigin() {
  const configured = process.env.SITE_URL?.trim();
  const vercelProduction = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const vercelDeployment = process.env.VERCEL_URL?.trim();
  const candidate = configured || (vercelProduction && `https://${vercelProduction}`) || (vercelDeployment && `https://${vercelDeployment}`) || sourceOrigin;
  const url = new URL(candidate);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('SITE_URL must be a clean HTTPS origin, for example https://example.com');
  }
  return url.origin;
}

const targetOrigin = deploymentOrigin();
for (const relativePath of ['dist/index.html', 'dist/veterans/index.html', 'dist/robots.txt', 'dist/sitemap.xml']) {
  const path = resolve(root, relativePath);
  const current = readFileSync(path, 'utf8');
  writeFileSync(path, current.replaceAll(sourceOrigin, targetOrigin));
}

console.log(JSON.stringify({ prepared: true, canonical_origin: targetOrigin }));
