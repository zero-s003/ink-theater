/**
 * 构建期抓取 Google Fonts 的字形子集：只下载页面真正用到的字。
 * 文案改动后重跑 `npm run fonts`，否则新字会缺。
 */
import fs from 'node:fs';
import path from 'node:path';

// 本机证书链不完整，构建期访问 Google Fonts 需要放宽校验
// shortcut: 只对构建脚本生效，运行时页面不加载任何第三方资源
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const root = process.cwd();
const outDir = path.join(root, 'src', 'fonts');
const cssOut = path.join(root, 'src', 'fonts.css');

const BASIC =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,:;!?/·—–-()[]「」『』《》、。，；：？！…％%+×&"\'’‘“”';

const CJK = /[⺀-鿿＀-￯　-〿]/;

const chars = new Set(BASIC.split(''));

// 页面正文：剥掉标签，只取真正会显示的字
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const visible = html
  .replace(/<script[\s\S]*?<\/script>/gi, '')
  .replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&[a-z]+;/gi, ' ');
for (const ch of visible) chars.add(ch);

// 脚本里的文案：只取中文与全角标点，避免把代码符号喂进子集
for (const rel of ['src/main.ts', 'src/ui/notes.ts', 'src/ui/clock.ts']) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) continue;
  for (const ch of fs.readFileSync(file, 'utf8')) if (CJK.test(ch)) chars.add(ch);
}

const text = [...chars].filter((c) => c.codePointAt(0) >= 0x20).join('');

const families = [
  'Noto+Serif+SC:wght@200;300;400;600',
  'Ma+Shan+Zheng',
];
const url = `https://fonts.googleapis.com/css2?${families
  .map((f) => `family=${f}`)
  .join('&')}&display=swap&text=${encodeURIComponent(text)}`;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const res = await fetch(url, { headers: { 'User-Agent': UA } });
if (!res.ok) throw new Error(`Google Fonts ${res.status}`);
const css = await res.text();

const blocks = css.match(/@font-face\s*{[^}]*}/g) ?? [];
if (!blocks.length) throw new Error('no @font-face returned');

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

// Google 对多字重返回同一份可变字体文件，按 src 去重后用字重区间声明，
// 否则 300/400/600 会被压成同一个实例。
const groups = new Map();
for (const block of blocks) {
  const family = /font-family:\s*'([^']+)'/.exec(block)?.[1] ?? 'font';
  const weight = Number(/font-weight:\s*(\d+)/.exec(block)?.[1] ?? 400);
  const src = /url\((https:[^)]+)\)/.exec(block)?.[1];
  if (!src) continue;
  const key = `${family}|${src}`;
  const g = groups.get(key) ?? { family, src, weights: [], range: '' };
  g.weights.push(weight);
  g.range ||= /unicode-range:\s*([^;}]+)/.exec(block)?.[1]?.trim() ?? '';
  groups.set(key, g);
}

const out = [];
let i = 0;
for (const g of groups.values()) {
  const bin = await fetch(g.src, { headers: { 'User-Agent': UA } });
  if (!bin.ok) throw new Error(`font ${bin.status} ${g.src}`);
  const slug = g.family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const name = `${slug}-${i++}.woff2`;
  fs.writeFileSync(path.join(outDir, name), Buffer.from(await bin.arrayBuffer()));

  const lo = Math.min(...g.weights);
  const hi = Math.max(...g.weights);
  const weight = lo === hi ? String(lo) : `${lo} ${hi}`;
  out.push(
    `@font-face{font-family:'${g.family}';font-style:normal;font-weight:${weight};font-display:swap;` +
      `src:url('./fonts/${name}') format('woff2');` +
      (g.range ? `unicode-range:${g.range};` : '') +
      `}`,
  );
}

fs.writeFileSync(cssOut, out.join('\n') + '\n');

const total = fs.readdirSync(outDir).reduce((a, f) => a + fs.statSync(path.join(outDir, f)).size, 0);
console.log(`[fonts] ${out.length} faces, ${(total / 1024).toFixed(0)} KB, ${[...text].length} chars`);
