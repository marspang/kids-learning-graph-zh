// 调用 OpenAI 兼容的云 API，分批翻译官方数据集 -> data/zh/*.zh.json
// 用法：
//   LLM_API_KEY=xxx node scripts/translate.mjs                 # 全量（核心三件套）
//   LLM_API_KEY=xxx node scripts/translate.mjs --limit=120     # 小样本试跑
//   LLM_API_KEY=xxx node scripts/translate.mjs --include-research
//   LLM_API_KEY=xxx node scripts/translate.mjs --retranslate   # 忽略缓存，全部重翻
// 可选环境变量：LLM_BASE_URL / LLM_MODEL / BATCH_SIZE / CONCURRENCY / LLM_TEMPERATURE
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, SRC_DIR, ZH_DIR, readJson, writeJson } from './lib.mjs';

const cfg = {
  baseUrl: (process.env.LLM_BASE_URL ?? 'https://api.deepseek.com/v1').replace(/\/$/, ''),
  apiKey: process.env.LLM_API_KEY,
  model: process.env.LLM_MODEL ?? 'deepseek-chat',
  temperature: Number(process.env.LLM_TEMPERATURE ?? 0.2),
  batchSize: Number(process.env.BATCH_SIZE ?? 24),
  concurrency: Number(process.env.CONCURRENCY ?? 4),
  timeoutMs: Number(process.env.LLM_TIMEOUT_MS ?? 180000),
  maxRetry: Number(process.env.MAX_RETRY ?? 3),
};

const argv = process.argv.slice(2);
const hasFlag = (f) => argv.includes(f);
const limitArg = argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : Infinity;
const INCLUDE_RESEARCH = hasFlag('--include-research');
const RETRANSLATE = hasFlag('--retranslate');

if (!cfg.apiKey) {
  console.error('缺少 LLM_API_KEY。示例：\n  LLM_API_KEY=sk-xxx LLM_BASE_URL=https://api.deepseek.com/v1 LLM_MODEL=deepseek-chat node scripts/translate.mjs');
  process.exit(1);
}

// ---------------------------------------------------------------- 术语表
const SUBJECT_ZH = new Map();
const GLOSSARY = [];
const GLOSSARY_MAP = new Map();
for (const line of readFileSync(join(ROOT, 'scripts', 'glossary.tsv'), 'utf8').split('\n')) {
  if (!line.trim() || line.trim().startsWith('#')) continue;
  const [en, zh] = line.split('\t');
  if (en && zh) {
    GLOSSARY.push(`${en.trim()} => ${zh.trim()}`);
    GLOSSARY_MAP.set(en.trim(), zh.trim());
  }
}
for (const [en, zh] of [
  ['Science', '科学'], ['Mathematics', '数学'], ['English', '英语'], ['History', '历史'],
  ['Personal & Social Development', '个人与社会发展'], ['Life Skills', '生活技能'],
  ['Computing', '计算机'], ['Learning to Learn', '学会学习'],
]) SUBJECT_ZH.set(en, zh);

// ---------------------------------------------------------------- 可翻译字段白名单
// 只有这些键下的字符串会被送去翻译，其余字段（id / url / standards / 枚举 / 日期）原样保留
const TRANSLATABLE_KEYS = new Set([
  // topics
  'name', 'description', 'evidence', 'assessmentPrompt',
  // dependencies
  'reason',
  // clusters
  'summary',
  // teaching-research
  'bestPractices', 'keyRepresentations', 'commonMisconceptions', 'activities', 'title',
  'feedback', 'rationale', 'sourceClaims', 'learnerActions', 'intendedInsight',
  'constraints', 'reviewNotes', 'method', 'poeTask', 'probeDeeper', 'correctAnswer',
  'errorPatterns', 'pattern', 'nextMove', 'distractor', 'revealedBy', 'gap', 'full',
  'partial', 'diagnosticPrompt', 'whatMakesItDiscriminate', 'claim',
]);

// ---------------------------------------------------------------- 采集任务
const jobs = [];
const seen = new Set();

function walk(node, path = []) {
  if (typeof node === 'string') return;
  if (Array.isArray(node)) {
    node.forEach((v, i) => walk(v, [...path, String(i)]));
    return;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === 'string' && TRANSLATABLE_KEYS.has(k) && v.trim()) {
        const key = [...path, k].join('/');
        if (!seen.has(key)) {
          seen.add(key);
          jobs.push({ k: key, s: v });
        }
      } else {
        walk(v, [...path, k]);
      }
    }
  }
}

const files = [
  ['topics.json', 'topics.zh.json'],
  ['dependencies.json', 'dependencies.zh.json'],
  ['clusters.json', 'clusters.zh.json'],
];
if (INCLUDE_RESEARCH) files.push(['teaching-research.json', 'teaching-research.zh.json']);

const sources = new Map();
for (const [srcName, outName] of files) {
  const p = join(SRC_DIR, srcName);
  if (!existsSync(p)) {
    console.error(`缺少 data/source/${srcName}，请先运行 npm run fetch`);
    process.exit(1);
  }
  const data = readJson(p);
  sources.set(outName, data);
  walk(data, [srcName.replace('.json', '')]);
}
console.log(`可翻译片段：${jobs.length} 个（${files.map(([s]) => s).join(', ')}）`);

// 领域（domain）是闭集，用术语表做确定性映射，保证全库译法一致
const DOMAIN_ZH = new Map();
{
  const domains = new Set();
  for (const data of sources.values()) {
    for (const item of data.topics ?? data.clusters ?? []) {
      if (item?.domain) domains.add(item.domain);
    }
  }
  const missing = [];
  for (const d of [...domains].sort()) {
    const zh = GLOSSARY_MAP.get(d);
    if (zh) DOMAIN_ZH.set(d, zh);
    else missing.push(d);
  }
  console.log(`领域映射：命中 ${DOMAIN_ZH.size}/${domains.size}`);
  if (missing.length) console.warn(`  ⚠ 未收录领域，请在 glossary.tsv 补充：\n    - ${missing.join('\n    - ')}`);
}

// ---------------------------------------------------------------- 缓存（断点续跑）
const CACHE_PATH = join(ZH_DIR, '.cache.jsonl');
const cache = new Map();
if (existsSync(CACHE_PATH) && !RETRANSLATE) {
  for (const line of readFileSync(CACHE_PATH, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const { k, zh } = JSON.parse(line);
      cache.set(k, zh);
    } catch { /* 忽略坏行 */ }
  }
}
console.log(`缓存已有：${cache.size} 个片段`);

let pending = jobs.filter((j) => !cache.has(j.k));
if (LIMIT !== Infinity) pending = pending.slice(0, LIMIT);
console.log(`本次待翻译：${pending.length} 个片段\n`);

// ---------------------------------------------------------------- 提示词
const systemPrompt = [
  '你是儿童教育课程数据的专业译者，把英文词条翻译成简体中文，用于面向中国家长与教师的儿童学习图谱产品。',
  '规则：',
  '1) 只翻译，不解释、不总结、不添加原文。',
  '2) 术语必须与下面的术语表一致；表中未收录的术语，全库保持统一译法。',
  '3) 原文中的占位符 {{name}} 必须原样保留。',
  '4) 数字、单位、公式、标准化考试/课标缩写（如 NGSS、CCSS）保持原样或使用通行中文说法。',
  '5) 语气面向家长，自然、简洁、口语化，不要机器腔，不要文言腔。',
  '6) 英文句子可能不完整（如 evidence 短句），按短句翻译，不要补全成段落。',
  '7) 英文缩写与专有名词保留英文原文，不要把 AI 译成"人工智能"（全称 Artificial Intelligence 仍按术语表译作"人工智能"）；中文与英文之间加一个半角空格，如"日常生活中的 AI"。',
  '8) 严格输出 JSON 数组，元素与输入一一对应且顺序一致，格式：[{"k":"<原样返回的键>","s":"<译文>"}]。',
  '   不要输出 markdown 代码块，不要输出任何额外文字。',
  '',
  '术语表：',
  ...GLOSSARY,
].join('\n');

async function callLLM(batch) {
  const body = {
    model: cfg.model,
    temperature: cfg.temperature,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify(batch.map(({ k, s }) => ({ k, s }))) },
    ],
  };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = await res.json();
    return json.choices?.[0]?.message?.content ?? '';
  } finally {
    clearTimeout(timer);
  }
}

function parseResult(text, batch) {
  let t = (text ?? '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  let arr;
  try {
    arr = JSON.parse(t);
  } catch {
    const m = t.match(/\[[\s\S]*\]/);
    if (!m) throw new Error('无法解析为 JSON 数组');
    arr = JSON.parse(m[0]);
  }
  if (!Array.isArray(arr)) throw new Error('输出不是数组');
  const out = new Map();
  for (const item of arr) {
    if (item && typeof item.k === 'string' && typeof item.s === 'string') out.set(item.k, item.s);
  }
  const requested = new Set(batch.map((b) => b.k));
  return { out, missing: batch.filter((b) => !out.has(b.k)) };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runBatch(batch, depth = 0) {
  let lastErr;
  for (let attempt = 1; attempt <= cfg.maxRetry; attempt += 1) {
    try {
      const text = await callLLM(batch);
      const { out, missing } = parseResult(text, batch);
      if (out.size === 0) throw new Error('返回空结果');
      for (const [k, zh] of out) {
        cache.set(k, zh);
        appendFileSync(CACHE_PATH, `${JSON.stringify({ k, zh })}\n`);
      }
      if (missing.length) {
        console.warn(`    ⚠ 返回缺少 ${missing.length} 条，将重试`);
        if (depth >= 2) return missing.length;
        return await runBatch(missing, depth + 1);
      }
      return 0;
    } catch (e) {
      lastErr = e;
      const wait = 1500 * attempt;
      console.warn(`    重试 ${attempt}/${cfg.maxRetry}：${e.message}（${wait}ms 后）`);
      await sleep(wait);
    }
  }
  console.error(`    ✗ 批次放弃：${lastErr?.message}`);
  return batch.length;
}

// ---------------------------------------------------------------- 并发执行
const batches = [];
for (let i = 0; i < pending.length; i += cfg.batchSize) {
  batches.push(pending.slice(i, i + cfg.batchSize));
}
console.log(`共 ${batches.length} 批 × ${cfg.batchSize} 条，并发 ${cfg.concurrency}\n`);

let done = 0;
let failed = 0;
let cursor = 0;
async function worker(id) {
  while (cursor < batches.length) {
    const idx = cursor++;
    const batch = batches[idx];
    failed += await runBatch(batch);
    done += batch.length;
    process.stdout.write(`\r  worker${id} 进度 ${done}/${pending.length} 片段，失败 ${failed} `);
  }
}
await Promise.all(Array.from({ length: cfg.concurrency }, (_, i) => worker(i)));
console.log('\n翻译阶段结束。');

// ---------------------------------------------------------------- 回填输出
const zhText = (en, key) => cache.get(key) ?? en;

function apply(node, path, stats) {
  if (Array.isArray(node)) {
    node.forEach((v, i) => apply(v, [...path, String(i)], stats));
    return node;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === 'string' && TRANSLATABLE_KEYS.has(k) && v.trim()) {
        const key = [...path, k].join('/');
        const zh = cache.get(key);
        if (zh) {
          if (v.includes('{{name}}') && !zh.includes('{{name}}')) stats.placeholder += 1;
          node[k] = zh;
          stats.translated += 1;
        } else {
          stats.missing += 1;
        }
      } else {
        apply(v, [...path, k], stats);
      }
    }
  }
  return node;
}

const summary = [];
for (const [srcName, outName] of files) {
  const data = sources.get(outName);
  const stats = { translated: 0, missing: 0, placeholder: 0 };
  apply(data, [srcName.replace('.json', '')], stats);
  // 补充确定性中文字段（不走 LLM）
  const list = data.topics ?? data.dependencies ?? data.clusters ?? data.records ?? null;
  if (Array.isArray(list)) {
    for (const item of list) {
      if (item?.subject && SUBJECT_ZH.has(item.subject)) item.subjectZh = SUBJECT_ZH.get(item.subject);
      if (item?.domain && DOMAIN_ZH.has(item.domain)) item.domainZh = DOMAIN_ZH.get(item.domain);
    }
  }
  writeJson(join(ZH_DIR, outName), data);
  summary.push({ outName, ...stats });
  console.log(`  → data/zh/${outName}  已译 ${stats.translated} · 未译 ${stats.missing} · 占位符异常 ${stats.placeholder}`);
}

writeJson(
  join(ZH_DIR, 'meta.json'),
  {
    generatedAt: new Date().toISOString(),
    model: cfg.model,
    baseUrl: cfg.baseUrl,
    upstream: readJson(join(SRC_DIR, 'UPSTREAM.json')),
    files: summary,
    license: '衍生数据库，按 ODbL 1.0 开放；文本层继承 CC BY-SA 4.0。署名见 ATTRIBUTION.md。',
  },
  true,
);
console.log('\n完成。运行 npm run build 生成 3D 图谱数据包。');
