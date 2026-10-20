// 数据校验：源数据完整性、中文字段覆盖率、图谱数据包一致性
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SRC_DIR, ZH_DIR, DIST_DIR, readJson } from './lib.mjs';

let problems = 0;
let warnings = 0;
const fail = (msg) => { console.error(`  ✗ ${msg}`); problems += 1; };
const warn = (msg) => { console.warn(`  ⚠ ${msg}`); warnings += 1; };
const ok = (msg) => console.log(`  ✓ ${msg}`);

console.log('\n[1/4] 源数据完整性');
const topicsSrc = readJson(join(SRC_DIR, 'topics.json')).topics;
const depsSrc = readJson(join(SRC_DIR, 'dependencies.json')).dependencies;
const ids = new Set();
for (const t of topicsSrc) {
  if (ids.has(t.id)) fail(`主题 id 重复：${t.id}`);
  ids.add(t.id);
}
const badDeps = depsSrc.filter((d) => !ids.has(d.topicId) || !ids.has(d.prerequisiteId));
badDeps.length ? fail(`${badDeps.length} 条依赖指向不存在的主题`) : ok(`依赖引用完整（${depsSrc.length} 条）`);
ok(`主题 ${topicsSrc.length} 个，id 唯一`);

console.log('\n[2/4] 中文数据集覆盖率');
const pairs = [
  ['topics.json', 'topics.zh.json', 'topics'],
  ['dependencies.json', 'dependencies.zh.json', 'dependencies'],
  ['clusters.json', 'clusters.zh.json', 'clusters'],
];
for (const [srcName, zhName, key] of pairs) {
  const zhPath = join(ZH_DIR, zhName);
  if (!existsSync(zhPath)) { warn(`缺少 ${zhName}，跳过`); continue; }
  const src = readJson(join(SRC_DIR, srcName))[key];
  const zh = readJson(zhPath)[key];
  if (zh.length !== src.length) fail(`${zhName} 条数不一致：${zh.length} vs ${src.length}`);
  const cjk = /[\u4e00-\u9fff]/;
  let untranslated = 0;
  let total = 0;
  const scan = (node, inNameField = false) => {
    if (typeof node === 'string') return;
    if (Array.isArray(node)) return node.forEach((v) => scan(v));
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        if (typeof v === 'string' && ['name', 'description', 'evidence', 'assessmentPrompt', 'reason', 'summary'].includes(k)) {
          total += 1;
          if (!cjk.test(v)) untranslated += 1;
        } else scan(v);
      }
    }
  };
  scan(zh);
  if (untranslated) warn(`${zhName}：${untranslated}/${total} 条尚未中文化`);
  else ok(`${zhName}：${total} 条字段均已中文化`);

  if (key === 'topics' || key === 'clusters') {
    const noZh = zh.filter((x) => !x.domainZh).length;
    if (noZh) warn(`${zhName}：${noZh} 条缺少 domainZh（领域未映射）`);
    else ok(`${zhName}：domain 全部有中文映射`);
  }
}

console.log('\n[3/4] 图谱数据包');
const distPath = join(DIST_DIR, 'graphdata.json');
if (!existsSync(distPath)) {
  warn('缺少 graphdata.json，请先运行 npm run build');
} else {
  const g = readJson(distPath);
  const topicCount = existsSync(join(ZH_DIR, 'topics.zh.json'))
    ? readJson(join(ZH_DIR, 'topics.zh.json')).topics.length
    : null;
  if (topicCount !== null && g.nodes.length !== topicCount) fail(`节点数 ${g.nodes.length} 与主题数 ${topicCount} 不一致`);
  else ok(`节点 ${g.nodes.length} 个 · 连接 ${g.links.length} 条`);
  const nan = g.nodes.filter((n) => ![n.x, n.y, n.z].every(Number.isFinite)).length;
  nan ? fail(`${nan} 个节点坐标非数值`) : ok('坐标数值有效');
  if (g.nodes.some((n) => !n.t)) fail('存在无中文名的节点');
  else ok('所有节点均有中文标题');
  const maxLink = Math.max(...g.links.flat());
  if (maxLink >= g.nodes.length) fail(`连接下标越界：${maxLink}`);
  else ok('连接下标均在范围内');
  g.attribution?.includes('Marble') ? ok('已包含 Marble 署名') : fail('graphdata.json 缺少署名');
  g.groups?.length === g.gcol?.length ? ok(`学科分组 ${g.groups.length} 个`) : fail('groups 与 gcol 长度不一致');
}

console.log('\n[4/4] 授权文件');
for (const f of ['LICENSE', 'LICENSE-CONTENT', 'ATTRIBUTION.md']) {
  existsSync(join(SRC_DIR, '..', '..', f)) ? ok(f) : fail(`缺少 ${f}`);
}

console.log(`\n结果：${problems} 个错误，${warnings} 个警告`);
process.exit(problems ? 1 : 0);
