export function initKid(): void {
  const btn = document.querySelector<HTMLButtonElement>('[data-toggle="kid"]');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const on = !document.body.classList.contains('kid');
    document.body.classList.toggle('kid', on);
    btn.setAttribute('aria-pressed', String(on));
    if (on) localStorage.setItem('ink-kid', '1');
    else localStorage.removeItem('ink-kid');
  });

  // 童戏版是给孩子的：记住上次选择，打开就是
  if (localStorage.getItem('ink-kid')) {
    document.body.classList.add('kid');
    btn.setAttribute('aria-pressed', 'true');
  }
}
