interface NoteSpec {
  n: number;
  text: string;
  sel?: string;
}

const NOTES: NoteSpec[] = [
  { n: 1, text: '张彦远云「书画同体」。装裱之制，先定其势。' },
  { n: 2, text: '天地头不可省。上下各留一分，画才有立锥之地。' },
  { n: 3, text: '高远者仰山巅。挂在墙上，观者便是在山下。' },
  { n: 4, text: '一线贯上下，是立轴最难处。断一分，气便散。' },
  { n: 5, text: '长卷宜案头，不宜壁间。卧游之说，起于此。' },
  { n: 6, text: '引首如门，拖尾如庭，中间才是正堂。' },
  { n: 7, text: '平远者望远山。视线放平，心也就平了。' },
  { n: 8, text: '起承转合，长卷与文章同法。' },
  { n: 9, text: '团扇赠答，是把一握山水递到别人手里。' },
  { n: 10, text: '绢本双面，两面俱是画——这形制天生不许藏。' },
  { n: 11, text: '圆者求满。满不是塞，是把气收在圆心。' },
  { n: 12, text: '边角留白，圆才不闷。' },
  { n: 13, text: '折扇一开，扇骨便是山骨。' },
  { n: 14, text: '三角逼人向隅。越是不稳，越要看它如何立住。' },
  { n: 15, text: '峻拔之气从斜线来。横线安稳，斜线生风。' },
  { n: 16, text: '上重下轻，反增其险；险中求稳，是山势的骨。' },
  { n: 17, sel: '.stage--axis', text: '疾笔则墨不及纸，是为飞白。你划得越快，越看得见纸。' },
  { n: 18, sel: '.seal', text: '一印落定，满纸皆活。朱砂只用这一点，多了便俗。' },
];

interface NoteItem {
  target: HTMLElement | null;
  label: HTMLElement;
  path: SVGPathElement;
  dot: SVGCircleElement;
}

export function initNotes(): { update: () => void; toggle: () => boolean } {
  const root = document.getElementById('notes')!;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  root.appendChild(svg);

  const items: NoteItem[] = NOTES.map((spec) => {
    const target =
      document.querySelector<HTMLElement>(`[data-note="${spec.n}"]`) ??
      (spec.sel ? document.querySelector<HTMLElement>(spec.sel) : null);

    const label = document.createElement('div');
    label.className = 'note';
    const no = document.createElement('span');
    no.className = 'note__no';
    no.textContent = `注 ${String(spec.n).padStart(2, '0')}`;
    label.append(no, document.createTextNode(spec.text));

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('r', '0');

    root.appendChild(label);
    svg.append(path, dot);
    return { target, label, path, dot };
  });

  const mobileQuery = window.matchMedia('(max-width: 767px)');

  const update = (): void => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const mobile = mobileQuery.matches;
    const railW = Math.min(230, vw * 0.24);

    let slot = 0;
    for (const item of items) {
      if (!item.target) continue;
      const rect = item.target.getBoundingClientRect();
      const live = rect.height > 0 && rect.bottom > 60 && rect.top < vh - 30;
      item.label.classList.toggle('is-live', live);
      if (!live) {
        item.path.setAttribute('d', '');
        item.dot.setAttribute('r', '0');
        continue;
      }

      const tx = rect.left + Math.min(rect.width * 0.35, railW);
      const ty = Math.max(70, Math.min(vh - 40, rect.top + rect.height / 2));

      if (mobile) {
        // 手机上不做引线：批注收进底部的注疏条，按顺序排
        slot += 1;
        item.path.setAttribute('d', '');
        item.dot.setAttribute('r', '0');
        continue;
      }

      const lx = vw - 24 - railW;
      const ly = 96 + slot * 74;
      item.label.style.left = `${lx}px`;
      item.label.style.top = `${ly}px`;
      slot += 1;

      const x2 = lx;
      const y2 = ly + 16;
      const mx = (tx + x2) / 2;
      item.path.setAttribute('d', `M${tx.toFixed(1)} ${ty.toFixed(1)} C${mx.toFixed(1)} ${ty.toFixed(1)} ${mx.toFixed(1)} ${y2.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`);
      item.dot.setAttribute('cx', String(tx));
      item.dot.setAttribute('cy', String(ty));
      item.dot.setAttribute('r', '2');
    }
  };

  const btn = document.querySelector<HTMLButtonElement>('[data-toggle="notes"]');
  const toggle = (): boolean => {
    const on = !document.body.classList.contains('notes-on');
    document.body.classList.toggle('notes-on', on);
    root.setAttribute('aria-hidden', String(!on));
    btn?.setAttribute('aria-pressed', String(on));
    if (on) update();
    return on;
  };
  btn?.addEventListener('click', toggle);

  return { update, toggle };
}
