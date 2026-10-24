/** 团扇两面：按一下翻一面，返回当前目标值（0 = A，1 = B）。 */
export function initFan(): () => number {
  const btn = document.querySelector<HTMLButtonElement>('.fan');
  const section = document.getElementById('ch-3');
  if (!btn || !section) return () => 0;

  let target = 0;

  const apply = (v: number): void => {
    target = v;
    section.dataset.face = v ? 'b' : 'a';
    btn.setAttribute('aria-pressed', String(v === 1));
    btn.setAttribute('aria-label', v ? '翻到 A 面' : '翻到 B 面');
  };

  // 按钮自带 Enter / Space 触发 click
  btn.addEventListener('click', () => apply(target ? 0 : 1));

  return () => target;
}
