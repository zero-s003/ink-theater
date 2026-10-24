/**
 * 视觉核验：跑一遍关键状态并截图，同时收集控制台错误。
 * 依赖本机已安装的 Chrome，不下载 Playwright 自带的浏览器。
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const EXE = 'C:/Users/15826/AppData/Local/Google/Chrome/Application/chrome.exe';
const URL = process.env.URL ?? 'http://localhost:5173/';
const OUT = path.join(process.cwd(), '.shots');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: EXE,
  args: ['--enable-unsafe-swiftshader', '--force-color-profile=srgb'],
});

const problems = [];

async function session(name, viewport, steps, opts = {}) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1, ...opts });
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${name}] ${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`[${name}] pageerror: ${e.message}`));

  // 幕布在字体就位后才开，早一点截才拍得到完整的一张纸
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  if (name === 'desk') {
    await page.waitForTimeout(90);
    await page.screenshot({ path: path.join(OUT, 'desk-curtain.png') });
  }
  // 幕布约 2 秒后自动移除；减少动效或无 @property 时立刻消失
  await page.waitForFunction(() => !document.querySelector('.curtain'), null, { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await steps(page);
  await page.close();
}

const shot = async (page, name) => {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log('  shot', name);
};

const scrollTo = async (page, y) => {
  await page.evaluate((v) => window.scrollTo(0, v), y);
  await page.waitForTimeout(900);
};

/** 把某个元素的中心滚到视口 y 处，用来精确卡转场中段 */
const frameTo = async (page, sel, y) => {
  await page.evaluate(({ s, yy }) => {
    const el = document.querySelector(s);
    if (!el) return;
    const r = el.getBoundingClientRect();
    window.scrollTo(0, r.top + window.scrollY + r.height / 2 - yy);
  }, { s: sel, yy: y });
  await page.waitForTimeout(850);
};

const topOf = (page, sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return 0;
    return el.getBoundingClientRect().top + window.scrollY;
  }, sel);

await session('desk', { width: 1440, height: 900 }, async (page) => {
  await shot(page, 'desk-cover');

  // 引墨：横划一道慢笔、一道疾笔
  for (let i = 0; i < 40; i++) {
    await page.mouse.move(200 + i * 18, 620 + Math.sin(i / 5) * 40);
    await page.waitForTimeout(12);
  }
  for (let i = 0; i < 24; i++) {
    await page.mouse.move(260 + i * 34, 300);
    await page.waitForTimeout(4);
  }
  await page.waitForTimeout(900);
  await shot(page, 'desk-ink');

  await scrollTo(page, await topOf(page, '#ch-1'));
  await shot(page, 'desk-ch1');

  const reelTop = await topOf(page, '.reel');
  await scrollTo(page, reelTop + 900);
  await shot(page, 'desk-ch2');

  // 转场中段：把扇心卡在视口下方约一个屏处，此时墨带最强
  await frameTo(page, '.fan', 1050);
  await shot(page, 'desk-sweep');

  await scrollTo(page, await topOf(page, '#ch-3'));
  await shot(page, 'desk-ch3');

  // 翻到 B 面
  await page.click('.fan');
  await page.waitForTimeout(1100);
  await shot(page, 'desk-fan-b');
  await page.click('.fan');
  await page.waitForTimeout(900);

  await scrollTo(page, await topOf(page, '#ch-4'));
  await shot(page, 'desk-ch4');

  await scrollTo(page, await topOf(page, '.originals'));
  await page.waitForFunction(
    () => [...document.querySelectorAll('.work img')].every((i) => i.complete && i.naturalWidth > 0),
    null,
    { timeout: 15000 },
  );
  await shot(page, 'desk-originals');

  await scrollTo(page, await topOf(page, '.colophon'));
  await shot(page, 'desk-colophon');

  await scrollTo(page, await topOf(page, '#ch-1'));
  await page.click('[data-toggle="notes"]');
  await page.waitForTimeout(900);
  await shot(page, 'desk-notes');

  await page.click('[data-toggle="notes"]');
  await page.click('[data-toggle="kid"]');
  await page.waitForTimeout(700);
  await shot(page, 'desk-kid');

  const fps = await page.evaluate(
    () =>
      new Promise((res) => {
        let n = 0;
        const t0 = performance.now();
        const tick = () => {
          n++;
          if (performance.now() - t0 < 1000) requestAnimationFrame(tick);
          else res(n);
        };
        requestAnimationFrame(tick);
      }),
  );
  console.log('  rAF/s (swiftshader):', fps);
});

await session('tablet', { width: 834, height: 1112 }, async (page) => {
  await shot(page, 'tab-cover');
  await scrollTo(page, await topOf(page, '#ch-2'));
  await shot(page, 'tab-ch2');
});

await session('mobile', { width: 390, height: 844 }, async (page) => {
  await shot(page, 'mob-cover');
  await scrollTo(page, await topOf(page, '#ch-1'));
  await shot(page, 'mob-ch1');
  await scrollTo(page, await topOf(page, '#ch-3'));
  await shot(page, 'mob-ch3');
  await scrollTo(page, await topOf(page, '.originals'));
  await shot(page, 'mob-originals');

  const overflow = await page.evaluate(() => {
    const de = document.documentElement;
    return { scrollW: de.scrollWidth, clientW: de.clientWidth };
  });
  if (overflow.scrollW > overflow.clientW + 1) {
    problems.push(`[mobile] horizontal overflow ${overflow.scrollW} > ${overflow.clientW}`);
  }
});

// 减少动效
await session('rm', { width: 1100, height: 740 }, async (page) => {
  await shot(page, 'rm-cover');
  await scrollTo(page, await topOf(page, '#ch-1'));
  await shot(page, 'rm-ch1');
}, { reducedMotion: 'reduce' });

// 手机上的批注
await session('mob-notes', { width: 390, height: 844 }, async (page) => {
  await scrollTo(page, await topOf(page, '#ch-3'));
  await page.click('[data-toggle="notes"]');
  await page.waitForTimeout(800);
  await shot(page, 'mob-notes');
});

await browser.close();

// 无 WebGL 回退
const noGl = await chromium.launch({
  executablePath: EXE,
  args: ['--disable-webgl', '--disable-3d-apis'],
});
{
  const page = await noGl.newPage({ viewport: { width: 1100, height: 740 } });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const fallback = await page.evaluate(() => document.body.classList.contains('no-gl'));
  console.log('  no-gl fallback applied:', fallback);
  if (!fallback) problems.push('[no-gl] fallback class missing');
  await page.screenshot({ path: path.join(OUT, 'nogl-cover.png') });
  await page.close();
}
await noGl.close();

console.log(problems.length ? `\nPROBLEMS:\n${problems.join('\n')}` : '\nno console problems');
