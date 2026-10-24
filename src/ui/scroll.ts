import Lenis from 'lenis';

export interface ScrollState {
  /** 全页进度 0..1，喂给山水平移 */
  page: number;
  /** 长卷横移 0..1；窄屏不做横移，但仍用来推章节 */
  reel: number;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export function initScroll(reduced: boolean): {
  update: () => ScrollState;
  lenis: Lenis | null;
} {
  const reel = document.querySelector<HTMLElement>('.reel');
  const track = document.querySelector<HTMLElement>('.reel__track');
  const bar = document.querySelector<HTMLElement>('.reel__progress i');

  const lenis = reduced
    ? null
    : new Lenis({ duration: 1.05, smoothWheel: true, touchMultiplier: 1.5 });

  document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const target = document.querySelector<HTMLElement>(a.getAttribute('href')!);
      if (!target) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(target, { offset: 0 });
      else target.scrollIntoView({ behavior: 'auto' });
    });
  });

  const state: ScrollState = { page: 0, reel: 0 };
  let trackSpan = 0;

  const measure = (): void => {
    trackSpan = track ? Math.max(0, track.scrollWidth - window.innerWidth) : 0;
  };
  measure();
  window.addEventListener('resize', measure);

  const update = (): ScrollState => {
    const vh = window.innerHeight;
    const sy = window.scrollY;

    const doc = document.documentElement;
    state.page = clamp01(sy / Math.max(1, doc.scrollHeight - vh));

    if (reel) {
      const r = reel.getBoundingClientRect();
      const p = clamp01(-r.top / Math.max(1, r.height - vh));
      state.reel = p;
      if (window.innerWidth > 1023) {
        if (track) track.style.transform = `translate3d(${-p * trackSpan}px,0,0)`;
        if (bar) bar.style.transform = `scaleX(${p})`;
      }
    } else {
      state.reel = 0;
    }

    return state;
  };

  return { update, lenis };
}
