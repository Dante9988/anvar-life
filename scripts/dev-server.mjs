import {createServer} from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';

const root = resolve(import.meta.dirname, '../dist');
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.woff2':'font/woff2','.txt':'text/plain','.xml':'application/xml'};
const server = createServer(async (req,res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');
    res.setHeader('X-Content-Type-Options','nosniff');
    if (url.pathname.startsWith('/api/')) {
      const {default:handler} = await import('../api/index.mjs');
      return await handler(req,res);
    }
    let path = resolve(root,'.'+decodeURIComponent(url.pathname));
    if (path !== root && !path.startsWith(root+sep)) { res.writeHead(404); return res.end(); }
    try { if ((await stat(path)).isDirectory()) path = resolve(path,'index.html'); }
    catch { if (!extname(path)) path += '.html'; }
    const content = await readFile(path);
    res.setHeader('Content-Type',mime[extname(path)] || 'application/octet-stream');
    res.end(content);
  } catch (error) {
    res.statusCode = error.code === 'ENOENT' ? 404 : 503;
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({error:res.statusCode === 404 ? 'Not found' : 'Service unavailable'}));
  }
});
const port = Number(process.env.PORT || 8080);
server.listen(port,'127.0.0.1',()=>console.log(`Private local review: http://127.0.0.1:${port}`));
