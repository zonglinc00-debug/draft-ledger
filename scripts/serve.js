import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const document = await readFile(new URL('../dist/index.html', import.meta.url));
const port = Number(process.env.PORT || 4173);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port.');
createServer((request, response) => {
  const route = request.url.split('?')[0];
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
  } else if (route === '/' || route === '/index.html') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff' })
      .end(request.method === 'GET' ? document : undefined);
  } else {
    response.writeHead(404).end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`Draft Ledger is available at http://127.0.0.1:${port}`));
