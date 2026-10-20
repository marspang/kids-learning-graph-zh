// 下载官方 Marble Skill Taxonomy 数据，并按 manifest 校验 sha256
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { SRC_DIR, readJson, writeJson, sha256 } from './lib.mjs';

const UPSTREAM_REPO = 'withmarbleapp/os-taxonomy';
const REF = process.env.UPSTREAM_REF ?? 'main';
const RAW = `https://raw.githubusercontent.com/${UPSTREAM_REPO}/${REF}`;

// 需要下载的文件（teaching-research.json 不在 manifest.files 中，单独校验）
const FILES = [
  'manifest.json',
  'topics.json',
  'dependencies.json',
  'clusters.json',
  'curriculum-standards.json',
  'teaching-research.json',
];

async function download(name) {
  const url = `${RAW}/data/${name}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载失败 ${url} -> ${res.status}`);
  mkdirSync(SRC_DIR, { recursive: true });
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(join(SRC_DIR, name), buf);
  console.log(`  ✓ ${name}  ${(buf.length / 1024).toFixed(0)} KB`);
  return buf;
}

async function resolveCommit() {
  try {
    const res = await fetch(`https://api.github.com/repos/${UPSTREAM_REPO}/commits/${REF}`, {
      headers: { 'user-agent': 'kids-learning-graph-zh' },
    });
    if (!res.ok) return null;
    return (await res.json()).sha;
  } catch {
    return null;
  }
}

console.log(`拉取上游数据：${UPSTREAM_REPO}@${REF}`);
for (const name of FILES) await download(name);

// 校验：对照 manifest 中记录的 sha256
const manifest = readJson(join(SRC_DIR, 'manifest.json'));
const expected = manifest.files ?? {};
let bad = 0;
for (const [name, meta] of Object.entries(expected)) {
  const actual = sha256(join(SRC_DIR, name));
  const ok = actual === meta.sha256;
  console.log(`${ok ? '  ✓' : '  ✗'} 校验 ${name} ${ok ? '一致' : `不一致！期望 ${meta.sha256}，实际 ${actual}`}`);
  if (!ok) bad += 1;
}

if (bad > 0) {
  console.error(`\n有 ${bad} 个文件校验失败，请勿继续使用。`);
  process.exit(1);
}

const commit = await resolveCommit();
const pin = {
  upstream: `https://github.com/${UPSTREAM_REPO}`,
  ref: REF,
  commit,
  retrievedAt: new Date().toISOString(),
  taxonomyVersion: manifest.taxonomyVersion,
  generatedAt: manifest.generatedAt,
  counts: manifest.counts,
  licenses: {
    database: 'ODbL 1.0',
    contentMarble: 'CC BY-SA 4.0',
    curriculumStandards: '各上游自有许可，见 ATTRIBUTION.md',
  },
  files: Object.fromEntries(
    Object.entries(expected).map(([name, meta]) => [
      name,
      { bytes: meta.bytes, sha256: meta.sha256 },
    ]),
  ),
};
writeJson(join(SRC_DIR, 'UPSTREAM.json'), pin, true);
console.log(`\n上游版本已锁定 -> data/source/UPSTREAM.json (commit ${commit ?? 'unknown'})`);
console.log(`主题 ${manifest.counts.topics} · 依赖 ${manifest.counts.dependencies} · 领域摘要 ${manifest.counts.clusters}`);
