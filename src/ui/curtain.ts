const KEY = 'ink-curtain';

/**
 * 片头幕布：纸中央的长开一个洞，把页面交出来。
 * 返回 true 表示真的会演；false 表示已经直接跳过（调用方据此决定开场淡入）。
 */
export function initCurtain(reduced: boolean, onReveal: () => void): boolean {
  const el = document.querySelector<HTMLElement>('.curtain');
  if (!el) {
    onReveal();
    return false;
  }

  // 没有 @property 就没有可插值的遮罩变量，幕布会永远盖着
  const canAnimate = typeof CSS !== 'undefined' && 'registerProperty' in CSS;
  let seen = false;
  try {
    seen = sessionStorage.getItem(KEY) === '1';
  } catch {
    // 隐私模式拿不到 sessionStorage，就当作没看过
  }

  if (reduced || !canAnimate || seen) {
    el.remove();
    onReveal();
    return false;
  }

  const open = (): void => {
    el.classList.add('is-open');
    onReveal();
    try {
      sessionStorage.setItem(KEY, '1');
    } catch {
      // 存不了就算了，下次再演一遍
    }
    window.setTimeout(() => el.remove(), 1600);
  };

  // 万无一失：不管上面哪一步卡住，四秒后都把幕布撤掉
  window.setTimeout(() => {
    if (!el.isConnected) return;
    el.remove();
  }, 4000);

  // 等字体落位再开，免得幕布上的印章先换一次字形
  document.fonts.ready
    .then(() => new Promise((resolve) => requestAnimationFrame(resolve)))
    .then(() => window.setTimeout(open, 240));

  return true;
}
