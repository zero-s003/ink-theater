const NOISE = `
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}
float ridged(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * (1.0 - abs(vnoise(p) * 2.0 - 1.0));
    p = p * 2.11 + 9.3;
    a *= 0.5;
  }
  return v;
}
`;

/** 宣纸：rgb 为纸色，a 为吸水率。吸水率高的地方墨会渗得更远。 */
export const PAPER_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform vec2 uRes;
uniform float uSeed;
${NOISE}

void main() {
  vec2 uv = vUv;
  float n = fbm(uv * 5.0 + uSeed);
  float fibre = fbm(vec2(uv.x * 92.0, uv.y * 6.0) + uSeed * 3.0);
  float fleck = smoothstep(0.64, 0.80, fbm(uv * 64.0 + uSeed * 2.0));

  vec3 base = mix(vec3(0.874, 0.838, 0.766), vec3(0.952, 0.930, 0.882), n);
  base *= 0.972 + 0.055 * fibre;
  base -= fleck * 0.014;

  float absorb = clamp(0.34 + 0.66 * fbm(uv * 3.4 + 7.0), 0.0, 1.0);
  fragColor = vec4(base, absorb);
}`;

/** 落墨：把本帧的笔迹段叠加到已有墨层上。 */
export const SPLAT_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uPrev;
uniform sampler2D uPaper;
uniform vec2 uRes;
uniform vec4 uSeg[16];
uniform vec4 uSegB[16];
uniform int uCount;
${NOISE}

float sdSegment(vec2 p, vec2 a, vec2 b, out float h) {
  vec2 pa = p - a, ba = b - a;
  h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  vec2 uv = vUv;
  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  vec2 p = uv * asp;
  vec4 prev = texture(uPrev, uv);

  float ink = 0.0;
  for (int i = 0; i < 16; i++) {
    if (i >= uCount) break;
    vec2 a = uSeg[i].xy * asp;
    vec2 b = uSeg[i].zw * asp;
    float h = 0.0;
    float d = sdSegment(p, a, b, h);
    // 笔锋不会是一根等宽的管子：边缘随行笔微微起伏
    float wobble = 1.0 + (vnoise(vec2(dot(p - a, vec2(3.0, 7.0)), 4.0)) - 0.5) * 0.35;
    float r = uSegB[i].x * wobble;
    float body = 1.0 - smoothstep(r * 0.40, r, d);

    // 飞白：沿笔势拉长的噪声把笔迹咬成丝，而不是切成方块
    vec2 dir = normalize(b - a + vec2(1e-5));
    vec2 nrm = vec2(-dir.y, dir.x);
    float along = dot(p - a, dir);
    float across = dot(p - a, nrm);
    float streak = vnoise(vec2((across / max(r, 1e-4)) * 6.0, along * 14.0));

    float dryness = uSegB[i].z;
    float bite = mix(1.0, smoothstep(0.12, 0.86, streak), dryness);
    ink = max(ink, body * uSegB[i].y * bite);
  }

  float density = max(prev.r, ink);
  float wet = max(prev.g * 0.995, ink);
  fragColor = vec4(density, wet, 0.0, 1.0);
}`;

/** 渗化：湿墨向纸纤维方向扩散，干后留下墨边。 */
export const BLEED_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uInk;
uniform sampler2D uPaper;
uniform vec2 uTexel;
uniform float uFlush;
${NOISE}

void main() {
  vec2 uv = vUv;
  vec4 c = texture(uInk, uv);
  float absorb = texture(uPaper, uv).a;

  vec2 r = uTexel * mix(2.6, 6.2, absorb);
  float blur = 0.0;
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 0.5235988;
    float scale = 0.55 + 0.45 * float(i % 3);
    vec2 o = vec2(cos(a), sin(a)) * r * scale;
    blur += texture(uInk, uv + o).r;
  }
  blur /= 12.0;

  float wet = c.g * 0.968;
  float spread = max(blur - c.r, 0.0) * wet * absorb;
  float density = c.r + spread * 0.55;
  // 已干的墨在边缘留一圈更深的痕
  density += max(c.r - blur, 0.0) * wet * 0.7;

  density *= 1.0 - uFlush;
  fragColor = vec4(clamp(density, 0.0, 1.0), wet * (1.0 - uFlush), 0.0, 1.0);
}`;

/** 山水：五层山脊，带皴法与云雾。输出 r 为墨浓度。 */
export const LANDSCAPE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform vec2 uRes;
uniform float uTime;
uniform float uScroll;
uniform float uChapter;
/** 当前形制框：山水在框内自成构图，而不是跟着屏幕走 */
uniform vec2 uFrameC;
uniform vec2 uFrameS;
${NOISE}

float layer(vec2 p, float d, float seed, float shift) {
  float scale = mix(0.70, 1.90, d);
  float x = p.x * scale + shift * mix(0.14, 0.62, d) + seed * 4.3;

  // 高远式堆叠：远山在上、淡；近山在下、浓
  float base = mix(0.78, 0.38, d);
  float amp = mix(0.08, 0.27, d);
  float h = ridged(vec2(x * mix(0.50, 0.95, d) + uTime * 0.004, seed * 1.7));
  h = pow(h, mix(1.25, 2.1, d));

  // 章末山形更陡：uChapter 越高，峰越尖锐
  float sharpen = mix(0.85, 1.30, clamp(uChapter / 3.0, 0.0, 1.0));
  float crest = base - h * amp * sharpen;

  float diff = crest - p.y;           // > 0 即在山体内，往下一路化开
  float inside = smoothstep(0.0, 0.004, diff);

  // 远山只留一线，近山才肯露一点体
  float wash = exp(-diff * mix(17.0, 2.8, d));
  float cun = ridged(vec2(x * 5.0, p.y * 15.0 + seed * 5.0));
  float tex = mix(0.48, 0.28 + 1.12 * cun, d);

  float density = inside * wash * (0.30 + 0.9 * tex) * mix(0.16, 0.62, d);
  // 山脊线：墨色积在山棱上
  density += smoothstep(0.007, 0.0, diff) * mix(0.10, 0.46, d);

  // 苔点：山脊内侧零星几点浓墨，近山才有
  float nearRidge = smoothstep(0.040, 0.0, diff) * step(0.0, diff);
  float moss = smoothstep(0.80, 0.93, vnoise(vec2(x * 30.0, diff * 300.0 + seed * 7.0)));
  density += nearRidge * moss * smoothstep(0.40, 0.85, d) * 0.5;
  return density;
}

void main() {
  vec2 uv = vUv;
  vec2 p0 = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  // 以形制框为画心：框内坐标归一到 0..1
  vec2 q = (p0 - uFrameC) / max(uFrameS, vec2(0.02));
  vec2 p = q * 0.5 + 0.5;

  float shift = uScroll * 2.4;
  float d = 0.0;
  d = max(d, layer(p, 0.00, 1.0, shift));
  d = max(d, layer(p, 0.25, 2.0, shift));
  d = max(d, layer(p, 0.50, 3.0, shift));
  d = max(d, layer(p, 0.75, 4.0, shift));
  d = max(d, layer(p, 1.00, 5.0, shift));

  // 云雾：横向的淡带把山拦腰冲淡，留出呼吸
  float fog = smoothstep(0.50, 0.94, fbm(vec2(p.x * 2.1 + uScroll * 1.6, p.y * 6.0 + uTime * 0.012)));
  d *= 1.0 - fog * 0.58;

  // 近地的一层薄雾：山脚化进留白，也托住压在下半页的字
  d *= smoothstep(0.0, 0.22, p.y);
  fragColor = vec4(clamp(d, 0.0, 1.0), 0.0, 0.0, 1.0);
}`;

/** 合成：纸 × 山水 × 墨，外加形制遮罩与暗角。 */
export const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uPaper;
uniform sampler2D uInk;
uniform sampler2D uLand;
uniform vec2 uRes;
uniform float uChapter;
uniform float uTime;
/** 当前形制框，与山水共用同一份插值结果，保证遮罩不会跟着屏幕外的元素跑 */
uniform vec2 uFrameC;
uniform vec2 uFrameS;
${NOISE}

float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

/** 单位框里的等腰三角：顶尖 (0,1)，底边 y=-1。返回近似的内正外负。 */
float sdTriUnit(vec2 q) {
  float e1 = (q.y - 2.0 * q.x - 1.0) * 0.4472136;
  float e2 = (q.y + 2.0 * q.x - 1.0) * 0.4472136;
  float e3 = -1.0 - q.y;
  return max(max(e1, e2), e3);
}

float sdfFor(int i, vec2 p) {
  vec2 q = p - uFrameC;
  vec2 s = uFrameS;
  if (i == 2) return length(q) - min(s.x, s.y);           // 团扇：圆
  if (i == 3) return sdTriUnit(q / max(s, vec2(1e-4))) * min(s.x, s.y); // 山势：三角
  return sdBox(q, s);                                     // 其余：方
}

void main() {
  vec2 uv = vUv;
  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  vec2 p = (uv - 0.5) * asp;

  int i0 = int(floor(uChapter));
  int i1 = i0 + 1;
  float t = smoothstep(0.0, 1.0, fract(uChapter));

  float sdf = mix(sdfFor(i0, p), sdfFor(i1, p), t);
  // 遮罩边缘不该是一条机器直线：让它随墨颤动
  sdf += (vnoise(p * 34.0 + uTime * 0.05) - 0.5) * 0.0045;

  float aa = fwidth(sdf) * 1.1;
  float mask = 1.0 - smoothstep(-aa, aa * 1.4, sdf);

  vec3 paperCol = texture(uPaper, uv).rgb;
  // 卷首压淡一档，让封面上的字落在留白里
  float dim = mix(0.80, 1.0, clamp(uChapter + 1.0, 0.0, 1.0));
  // 长卷一章字压在画上，墨要退到淡墨那一档，字才站得住
  dim *= 1.0 - 0.44 * exp(-pow((uChapter - 1.0) * 1.7, 2.0));
  float land = texture(uLand, uv).r * mask * dim;
  float ink = texture(uInk, uv).r * mix(1.0, mask, 0.75);
  float total = clamp(land + ink * 0.95, 0.0, 1.0);

  vec3 inkCol = vec3(0.070, 0.066, 0.058);
  vec3 col = mix(paperCol, inkCol, smoothstep(0.02, 0.82, total));

  // 形制边界：一圈很轻的墨线
  float edge = smoothstep(0.004, 0.0, abs(sdf)) * 0.28;
  col = mix(col, vec3(0.10, 0.095, 0.085), edge);

  // 暗角与颗粒
  float vig = smoothstep(1.35, 0.30, length(p));
  col *= mix(0.93, 1.0, vig);
  col += (hash21(uv * uRes + uTime) - 0.5) * 0.014;

  fragColor = vec4(col, 1.0);
}`;
