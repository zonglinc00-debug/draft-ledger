import { readFile, mkdir, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const source = name => readFile(new URL(`src/${name}`, root), 'utf8');
const modules = ['draft', 'demo', 'scout', 'forecast', 'app'];
const imports = {};
for (const name of modules) {
  const js = (await source(`${name}.js`)).replace(/from '\.\/([a-z]+)\.js'/g, "from 'ledger/$1'");
  imports[`ledger/${name}`] = `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
}
const stylesheet = await source('styles.css');
const template = await source('index.html');
const script = `<script type="importmap">${JSON.stringify({ imports })}</script>
  <script type="module">import 'ledger/app';</script>`;
const document = template.replace('<!-- styles -->', () => `<style>\n${stylesheet}</style>`).replace('<!-- modules -->', () => script);
const target = new URL('dist/', root);
await mkdir(target, { recursive: true });
await writeFile(new URL('index.html', target), document);
console.log(`Built dist/index.html (${Buffer.byteLength(document).toLocaleString('en-US')} bytes).`);
