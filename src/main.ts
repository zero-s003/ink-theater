import './fonts.css';
import { InkRenderer } from './gl/renderer';
import { initClock } from './ui/clock';
import { initCurtain } from './ui/curtain';
import { initFan } from './ui/fan';
import { initKid } from './ui/kid';
import { initNotes } from './ui/notes';
import { initScroll } from './ui/scroll';

const canvas = document.getElementById('ink') as HTMLCanvasElement;
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const renderer = new InkRenderer(canvas);
if (!renderer.ok) document.body.classList.add('no-gl');

/* ---------- 形制框：跟着版面上的形制元素走 ---------- */
type Rect = { c: [number, number]; s: [number, number] };
const maskEls: (string | null)[] = [null, '.axis__body', null, '.fan', '.stage--peak svg'];

function readMasks(): Rect[] {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const asp = vw / vh;
  const out: Rect[] = [];

  for (let i = 0; i < 5; i++) {
    if (i === 0) {
      out.push({ c: [0, 0], s: [asp * 0.56, 0.60] });
      continue;
    }
    if (i === 2) {
      // 窄屏跟着页面里那条画带走
      const band = document.querySelector<HTMLElement>('.reel__band');
      const br = band?.getBoundingClientRect();
      if (br && br.height > 4) {
        out.push({
          c: [((br.left + br.width / 2) / vw - 0.5) * asp, 0.5 - (br.top + br.height / 2) / vh],
          s: [br.width / 2 / vh, br.height / 2 / vh],
        });
        continue;
      }
      // 桌面：横带从视口下沿展上来，钉住后铺满
      const reelEl = document.querySelector<HTMLElement>('.reel');
      const rr = reelEl?.getBoundingClientRect();
      const enter = rr ? Math.max(0, Math.min(1, (vh - rr.top) / (vh * 0.9))) : 1;
      const e = 0.3 + 0.7 * enter;
      out.push({ c: [0, enter - 1], s: [asp * 0.30 * e, 0.205 * e] });
      continue;
    }
    const el = maskEls[i] ? document.querySelector<HTMLElement>(maskEls[i]!) : null;
    if (!el) {
      out.push({ c: [0, 0], s: [0.5, 0.5] });
      continue;
    }
    const r = el.getBoundingClientRect();
    out.push({
      c: [((r.left + r.width / 2) / vw - 0.5) * asp, 0.5 - (r.top + r.height / 2) / vh],
      s: [r.width / 2 / vh, r.height / 2 / vh],
    });
  }
  return out;
}

initClock();
initKid();
const notes = initNotes();
const { update: updateScroll, lenis } = initScroll(reduced);
const fanTarget = initFan();

/* ---------- 开场 ---------- */
let intro = 0;
let introStart = -1;
const curtainAnimates = initCurtain(reduced, () => { introStart = performance.now(); });
if (!curtainAnimates) intro = 1;

/* ---------- 团扇两面 ---------- */
let face = 0;

/* ---------- 毛笔光圈 ---------- */
const fine = window.matchMedia('(pointer: fine)').matches && !reduced;
const ring = document.createElement('div');
ring.className = 'cursor-ring';
let ringX = 0, ringY = 0, pointerX = 0, pointerY = 0, hasPointer = false;

if (fine) {
  document.body.appendChild(ring);
  window.addEventListener('pointermove', (e) => {
    pointerX = e.clientX;
    pointerY = e.clientY;
    if (!hasPointer) {
      ringX = pointerX;
      ringY = pointerY;
      hasPointer = true;
      ring.classList.add('is-on');
    }
  }, { passive: true });
  document.addEventListener('mouseleave', () => ring.classList.remove('is-on'));
}

/* ---------- 印章落下 ---------- */
const seal = document.querySelector<HTMLElement>('.seal');
if (seal && !reduced) {
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        seal.classList.add('is-stamped');
        io.disconnect();
      }
    }
  }, { threshold: 0.55 });
  io.observe(seal);
}

/* ---------- 引墨 ---------- */
let px = 0, py = 0, pt = 0, tracking = false;

window.addEventListener('pointermove', (e) => {
  if (reduced || document.body.classList.contains('kid')) return;
  // 顶栏与可点元素上不落墨，免得把控制项糊住
  if (e.target instanceof Element && e.target.closest('a, button, .hud')) {
    tracking = false;
    return;
  }
  const now = performance.now();
  if (!tracking) {
    tracking = true;
    px = e.clientX; py = e.clientY; pt = now;
    return;
  }
  const dx = e.clientX - px;
  const dy = e.clientY - py;
  const dist = Math.hypot(dx, dy);
  if (dist < 2) return;

  const speed = dist / Math.max(1, now - pt);
  const fast = Math.min(1, Math.max(0, (speed - 0.12) / 1.1));
  const w = window.innerWidth;
  const h = window.innerHeight;

  renderer.addStroke({
    x0: px / w, y0: 1 - py / h,
    x1: e.clientX / w, y1: 1 - e.clientY / h,
    r: 0.034 - 0.020 * fast,
    ink: 0.32 - 0.14 * fast,
    dry: fast * fast,
  });

  px = e.clientX; py = e.clientY; pt = now;
}, { passive: true });

window.addEventListener('pointerleave', () => { tracking = false; }, { passive: true });

/* ---------- 主循环 ---------- */
let raf = 0;
let last = performance.now();
let lastScrollY = -1;
let lastChapter = -2;

const frame = (now: number): void => {
  raf = requestAnimationFrame(frame);
  const dt = Math.min(64, now - last);
  last = now;

  lenis?.raf(now);

  const s = updateScroll();
  const kid = document.body.classList.contains('kid');

  // 章节进度不看版面分节，只看每个形制框在视口里的位置：
  // 框走到哪，画面跟到哪，墨就不会跟着屏幕外的东西跑掉。
  const masks = readMasks();
  let chapter = -1;
  for (let i = 0; i < 4; i++) {
    const x = Math.max(0, Math.min(1, (masks[i + 1].c[1] + 1.0) / 0.65));
    chapter += x * x * (3 - 2 * x);
  }
  chapter = Math.max(-1, Math.min(3.999, chapter));

  // 开场：幕布一开，墨从无水到成形
  if (introStart >= 0 && intro < 1) intro = Math.min(1, (now - introStart) / 1200);

  // 团扇两面缓动
  const ft = fanTarget();
  face += (ft - face) * (1 - Math.exp(-dt / 170));
  if (Math.abs(ft - face) < 0.002) face = ft;

  if (fine && hasPointer) {
    const k = 1 - Math.exp(-dt / 90);
    ringX += (pointerX - ringX) * k;
    ringY += (pointerY - ringY) * k;
    ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0)`;
  }

  if (!kid) {
    const i0 = Math.floor(chapter);
    const i1 = Math.min(3, i0 + 1);
    const t = chapter - i0;
    const a = masks[i0 + 1];
    const b = masks[i1 + 1];
    const ease = intro * intro * (3 - 2 * intro);

    renderer.setChapter(chapter);
    renderer.setScroll(s.page);
    renderer.setSweep(t);
    renderer.setFace(face);
    renderer.setIntro(ease);
    renderer.setFrame(
      [a.c[0] + (b.c[0] - a.c[0]) * t, a.c[1] + (b.c[1] - a.c[1]) * t],
      [a.s[0] + (b.s[0] - a.s[0]) * t, a.s[1] + (b.s[1] - a.s[1]) * t],
    );
    // 减少动效时不推进时间：画面随滚动变化，但山不会自己漂
    renderer.frame(reduced ? 0 : dt);
  } else {
    renderer.setFace(0);
  }

  if (document.body.classList.contains('notes-on')) {
    if (Math.abs(window.scrollY - lastScrollY) > 0.5 || chapter !== lastChapter) {
      notes.update();
      lastScrollY = window.scrollY;
      lastChapter = chapter;
    }
  }
};

const start = (): void => {
  if (raf || document.hidden) return;
  last = performance.now();
  raf = requestAnimationFrame(frame);
};
const stop = (): void => {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
};

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stop();
  else start();
});

canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  document.body.classList.add('no-gl');
  stop();
});

let resizeTimer = 0;
window.addEventListener('resize', () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    renderer.resize();
    notes.update();
  }, 140);
});

start();
