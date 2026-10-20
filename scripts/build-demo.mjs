// 把 data/dist/graphdata.json 注入 docs/index.html 的数据块
// 目的：演示页保持「单文件、零依赖」—— 数据内联，双击即可打开，不依赖任何后端或 CDN。
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = join(ROOT, 'data/dist/graphdata.json');
const htmlPath = join(ROOT, 'docs/index.html');

const START = '/*DATA_START*/';
const END = '/*DATA_END*/';

const data = JSON.parse(readFileSync(dataPath, 'utf8'));
const html = readFileSync(htmlPath, 'utf8');

const a = html.indexOf(START);
const b = html.indexOf(END);
if (a < 0 || b < 0 || b < a) {
  console.error('docs/index.html 缺少 /*DATA_START*/ … /*DATA_END*/ 标记，无法注入');
  process.exit(1);
}

// 转义 </ 以免 JSON 里出现 </script> 提前闭合 script 标签（\/ 是合法 JSON 转义）
const payload = JSON.stringify(data).replace(/<\//g, '<\\/');
const out = html.slice(0, a + START.length) + payload + html.slice(b);

writeFileSync(htmlPath, out);
console.log(`→ ${htmlPath}`);
console.log(`  ${(Buffer.byteLength(out) / 1024).toFixed(0)} KB · ${data.nodes.length} 节点 · ${data.links.length} 连线 · 数据内联`);
