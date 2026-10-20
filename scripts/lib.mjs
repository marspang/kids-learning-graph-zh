// 通用工具：路径、读写 JSON、sha256
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 仓库根目录 */
export const ROOT = fileURLToPath(new URL('..', import.meta.url));

export const SRC_DIR = join(ROOT, 'data', 'source');
export const ZH_DIR = join(ROOT, 'data', 'zh');
export const DIST_DIR = join(ROOT, 'data', 'dist');

export const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

export function writeJson(p, obj, pretty = false) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, pretty ? JSON.stringify(obj, null, 2) : JSON.stringify(obj), 'utf8');
}

export const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

/** 稳定的 32 位伪随机数生成器，用于布局可复现 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 由字符串派生稳定种子（FNV-1a） */
export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
