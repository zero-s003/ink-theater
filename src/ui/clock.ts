const SHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const KE = ['一', '二', '三', '四', '五', '六', '七', '八'];

/** 子时起于 23:00，每时辰两小时、八刻。 */
function reading(now: Date): { shi: string; ke: string } {
  const minutes = (now.getHours() * 60 + now.getMinutes() + 60) % 1440;
  return {
    shi: `${SHI[Math.floor(minutes / 120)]}时`,
    ke: `${KE[Math.floor((minutes % 120) / 15)]}刻`,
  };
}

export function initClock(): void {
  const shiEl = document.querySelector<HTMLElement>('.clock__shi');
  const keEl = document.querySelector<HTMLElement>('.clock__ke');
  if (!shiEl || !keEl) return;

  const tick = (): void => {
    const { shi, ke } = reading(new Date());
    if (shiEl.textContent !== shi) shiEl.textContent = shi;
    if (keEl.textContent !== ke) keEl.textContent = ke;
  };
  tick();
  setInterval(tick, 20000);
}
