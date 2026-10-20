// 由中文数据集生成前端可直接使用的 3D 图谱数据包 -> data/dist/graphdata.json
// 布局：x/z 由依赖关系（力导向）决定，y 轴固定为年龄高度（与官方可视化一致）
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  forceSimulation, forceLink, forceManyBody, forceCenter, forceX, forceY, forceZ,
} from 'd3-force-3d';
import { SRC_DIR, ZH_DIR, DIST_DIR, readJson, writeJson, mulberry32, hashString } from './lib.mjs';

const H = 1400;          // 年龄轴总高度
const SEED = Number(process.env.LAYOUT_SEED ?? 20260720);
const TICKS = Number(process.env.LAYOUT_TICKS ?? 420);

// 学科顺序与配色（沿用参考实现的色板，保证视觉连续性）
const SUBJECTS = [
  ['Mathematics', '数学', '#3D63D8'],
  ['Science', '科学', '#9DB8DC'],
  ['English', '英语', '#E76D95'],
  ['History', '历史', '#EFE3C8'],
  ['Personal & Social Development', '个人与社会发展', '#DD3B31'],
  ['Life Skills', '生活技能', '#E8B8C4'],
  ['Computing', '计算机', '#4B5AA8'],
  ['Learning to Learn', '学会学习', '#E8B08A'],
];

const topicsPath = join(ZH_DIR, 'topics.zh.json');
const depsPath = join(ZH_DIR, 'dependencies.zh.json');
if (!existsSync(topicsPath) || !existsSync(depsPath)) {
  console.error('缺少 data/zh/topics.zh.json 或 dependencies.zh.json，请先运行 npm run translate');
  process.exit(1);
}

const topics = readJson(topicsPath).topics;
const deps = readJson(depsPath).dependencies;

const subjectIndex = new Map(SUBJECTS.map(([en], i) => [en, i]));
const ageMin = Math.min(...topics.map((t) => t.ageRangeStart));
const ageMax = Math.max(...topics.map((t) => t.ageRangeStart));
const ageY = (age) => ((age - ageMin) / (ageMax - ageMin || 1)) * H - H / 2;

const rand = mulberry32(SEED);
const nodes = topics.map((t) => {
  const g = subjectIndex.get(t.subject) ?? 0;
  const seed = hashString(t.id);
  return {
    id: t.id,
    g,
    a: t.ageRangeStart,
    c: t.centrality ?? 0,
    col: SUBJECTS[g][2],
    dm: t.domainZh ?? t.domain ?? '',
    t: t.name ?? '',
    q: t.assessmentPrompt ?? '',
    x: ((seed % 200) - 100) * 1.0,
    y: ageY(t.ageRangeStart),
    z: (((seed >>> 8) % 200) - 100) * 1.0,
  };
});

const index = new Map(nodes.map((n, i) => [n.id, i]));
const depsOk = deps.filter((d) => index.has(d.topicId) && index.has(d.prerequisiteId));
const links = depsOk.map((d) => ({
  source: d.prerequisiteId,
  target: d.topicId,
  strength: d.strength === 'hard' ? 0.6 : 0.2,
}));
// 输出用的下标对（在力导向改动 link 对象之前先固定下来）
const linkPairs = depsOk.map((d) => [index.get(d.prerequisiteId), index.get(d.topicId)]);

console.log(`节点 ${nodes.length} · 依赖边 ${links.length} · 年龄 ${ageMin}-${ageMax} · 布局 ${TICKS} 步`);

const sim = forceSimulation(nodes, 3, rand)
  .force('link', forceLink(links).id((d) => d.id).distance(28).strength((l) => l.strength))
  .force('charge', forceManyBody().strength(-22).distanceMax(240))
  .force('center', forceCenter(0, 0, 0))
  .force('y', forceY((d) => ageY(d.a)))
  .force('x', forceX(0).strength(0.02))
  .force('z', forceZ(0).strength(0.02))
  .stop();

for (let i = 0; i < TICKS; i += 1) sim.tick();

// y 轴语义就是年龄，模拟结束后精确归位（保证"高度=年龄"严格成立）
for (const n of nodes) n.y = ageY(n.a);

// 归一化 x/z 到 ±360，保持垂直年龄轴不变
const maxRadial = Math.max(...nodes.map((n) => Math.hypot(n.x, n.z))) || 1;
const scale = 360 / maxRadial;
const r1 = (v) => Math.round(v * 10) / 10;
const bad = nodes.filter((n) => !Number.isFinite(n.x) || !Number.isFinite(n.y) || !Number.isFinite(n.z)).length;
if (bad) console.warn(`⚠ 有 ${bad} 个节点坐标为 NaN`);

const out = {
  generator: 'kids-learning-graph-zh',
  generatedAt: new Date().toISOString(),
  layout: { seed: SEED, ticks: TICKS, dimensions: 3, yAxis: 'age' },
  attribution:
    'Derived from Marble Skill Taxonomy (v1) · © Generative Spark, Inc. (Marble) · https://withmarble.com · ODbL 1.0 / CC BY-SA 4.0',
  groups: SUBJECTS.map(([, zh]) => zh),
  gcol: SUBJECTS.map(([, , col]) => col),
  H,
  ageMin,
  ageMax,
  nodes: nodes.map((n) => ({
    i: n.id,
    x: r1(n.x * scale),
    y: r1(n.y),
    z: r1(n.z * scale),
    g: n.g,
    a: n.a,
    c: n.c,
    col: n.col,
    dm: n.dm,
    t: n.t,
    q: n.q,
  })),
  links: linkPairs,
};

const distPath = join(DIST_DIR, 'graphdata.json');
writeJson(distPath, out);
console.log(`→ ${distPath}`);
console.log(`  ${out.nodes.length} 节点 · ${out.links.length} 连接 · 年龄轴 ${out.ageMin}-${out.ageMax}`);
