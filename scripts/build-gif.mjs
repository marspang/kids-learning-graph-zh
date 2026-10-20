// 录制 README 用的演示动图：media/curriculum-viz.gif + .mp4
// 依赖本地已安装的 Playwright（chromium）与 ffmpeg；这是开发期工具，不参与数据流水线。
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MEDIA = join(ROOT, 'media');
const FRAMES = join(MEDIA, '.frames');
const W = 1200, H = 675, FPS = 12, COUNT = 48;

const { chromium } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');

if (!existsSync(join(ROOT, 'docs/index.html'))) {
  console.error('缺少 docs/index.html，请先运行 npm run build && npm run demo');
  process.exit(1);
}
mkdirSync(MEDIA, { recursive: true });
rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:8932/docs/index.html?rec=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(1400);   // 等数据注入、卡片出现、首帧稳定

for (let i = 0; i < COUNT; i += 1) {
  await page.screenshot({ path: join(FRAMES, `f${String(i).padStart(3, '0')}.png`) });
  await page.waitForTimeout(1000 / FPS);
}
await browser.close();

const gif = join(MEDIA, 'curriculum-viz.gif');
const mp4 = join(MEDIA, 'curriculum-viz.mp4');
const src = join(FRAMES, 'f%03d.png');

execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', src,
  '-vf', `scale=1000:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=200:stats_mode=diff[p];[s1][p]paletteuse=dither=sierra2_4a`,
  '-loop', '0', gif]);

execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', src,
  '-vf', 'scale=1200:-2:flags=lanczos', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
  '-crf', '21', '-movflags', '+faststart', mp4]);

rmSync(FRAMES, { recursive: true, force: true });

const kb = (p) => (execFileSync('stat', ['-f', '%z', p]).toString().trim() / 1024).toFixed(0);
console.log(`→ ${gif} (${kb(gif)} KB)`);
console.log(`→ ${mp4} (${kb(mp4)} KB)`);
