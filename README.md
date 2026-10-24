# 墨迹剧场 · INK THEATER

复刻 [Obys《Format》](https://format.obys.agency/) 的滚动叙事骨架，把几何母题换成中国画的四种形制：
**立轴、长卷、团扇、山势**。画面不贴图——山水、宣纸、墨迹、皴法全部由 WebGL2 实时绘制。

## 跑起来

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # 类型检查 + 产物到 dist/
npm run preview
```

改了页面文案后要重新抓字体子集，否则新字缺字形：

```bash
npm run fonts      # 需要联网访问 Google Fonts
```

## 结构

```
index.html            全部文案与版式骨架
src/style.css         版式、竖排、响应式、童戏版配色
src/main.ts           装配：渲染器、滚动、引墨、形制框测量
src/gl/gl.ts          WebGL2 薄封装（program / FBO / 全屏三角）
src/gl/shaders.ts     五个着色器：纸、落墨、渗化、山水、合成
src/gl/renderer.ts    管线与自适应降级
src/ui/scroll.ts      Lenis + 长卷横移
src/ui/notes.ts       18 条画论批注
src/ui/clock.ts       十二时辰
src/ui/kid.ts         童戏版
src/ui/curtain.ts     片头幕布
src/ui/fan.ts         团扇 A/B 面
scripts/shoot.mjs     三档视口 + 减少动效 + 无 WebGL 的截图核验
```

## 渲染管线

1. **纸** — 一次性生成 1024² 纹理：纤维、吸水率、污渍
2. **落墨** — 指针轨迹转成线段，按速度决定笔宽与飞白；积墨用 max 叠加
3. **渗化** — 湿墨沿纸纤维扩散，速度由吸水率调制；干后留墨边
4. **山水** — 五层山脊（远淡近浓）、皴法、云雾、苔点；坐标以**当前形制框**归一，
   所以每个形制里的山水各自成立
5. **合成** — 纸 × 山水 × 墨，加上形制遮罩（矩形 / 圆 / 三角）、墨边、暗角

形制遮罩不是写死的：每帧从页面上的形制元素实测矩形，所以水墨框永远和版式对齐。
换章时墨会洗掉，免得越画越脏。

**换章的过渡**由形制框在视口中的位置驱动，不是定时器：框走到哪，画面跟到哪。
过渡中段会有一笔墨带横扫形制框（`uSweep`），笔身带顺着笔势的飞白。

**团扇两面**：点扇子翻面。A 面「圆」是留白山水，B 面「满」是夜色满月；
切换从扇心向外一圈圈透出（`uFace`），离开这一章会自动回到 A 面。

**片头幕布**：一张纸，中央的洞长开后交出页面。同一会话只演一次（sessionStorage）。
没有 `@property` 或不支持遮罩动画的浏览器直接跳过。

## 排版

全站一款 **思源宋体**，不靠第二款字体调味：

- 大标题 500 字重、字距 -0.03em——靠密度显贵，不靠拉开
- 章节名 500 / 0.06em，英文小标 400 / 0.34em
- 元数据 400 / 0.16em，像图录的著录行
- 印章是实朱砂块 + 反白宋体，不用手写体

## 降级与无障碍

- 帧耗时连续 90 帧超过 22ms → 自动降模拟分辨率
- `prefers-reduced-motion` → 冻结时间、关闭引墨与转场
- WebGL 不可用 / 上下文丢失 → 隐藏画布，改用 CSS 墨晕底
- 键盘可走完全部控件；批注按钮带 `aria-pressed`

## 授权

见 [CREDITS.md](./CREDITS.md)。真迹图像为 Met Open Access 公有领域；字体为 SIL OFL。
