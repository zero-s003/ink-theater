import {
  bindTex, clearTarget, drawFullscreen, freeTarget, makeProgram, makeTarget,
  supportsHDR, type Program, type Target,
} from './gl';
import { BLEED_FS, COMPOSITE_FS, LANDSCAPE_FS, PAPER_FS, SPLAT_FS } from './shaders';

export interface Stroke {
  x0: number; y0: number; x1: number; y1: number;
  r: number; ink: number; dry: number;
}

const PAPER_SIZE = 1024;
const MAX_SEGMENTS = 16;

export class InkRenderer {
  readonly gl: WebGL2RenderingContext;
  readonly ok: boolean;
  private canvas: HTMLCanvasElement;
  private vao: WebGLVertexArrayObject | null = null;
  private hdr = false;

  private programs: Record<'paper' | 'splat' | 'bleed' | 'land' | 'comp', Program> | null = null;
  private paper: Target | null = null;
  private inkA: Target | null = null;
  private inkB: Target | null = null;
  private land: Target | null = null;

  private cssW = 1;
  private cssH = 1;
  private dpr = 1;
  private simScale = 0.5;
  private quality = 1;

  private pending: Stroke[] = [];
  private segBuf = new Float32Array(MAX_SEGMENTS * 4);
  private segBBuf = new Float32Array(MAX_SEGMENTS * 4);

  private chapter = -1;
  private scroll = 0;
  private frameC: [number, number] = [0, 0];
  private frameS: [number, number] = [0.5, 0.5];
  private flush = 0;
  private wetFrames = 0;
  private time = 0;
  private frameSamples: number[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    if (!gl) {
      this.gl = null as unknown as WebGL2RenderingContext;
      this.ok = false;
      return;
    }
    this.gl = gl;
    this.hdr = supportsHDR(gl);
    this.simScale = window.innerWidth < 768 ? 0.34 : 0.5;

    try {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      this.programs = {
        paper: makeProgram(gl, PAPER_FS),
        splat: makeProgram(gl, SPLAT_FS),
        bleed: makeProgram(gl, BLEED_FS),
        land: makeProgram(gl, LANDSCAPE_FS),
        comp: makeProgram(gl, COMPOSITE_FS),
      };
      this.vao = gl.createVertexArray();
      this.paper = makeTarget(gl, PAPER_SIZE, PAPER_SIZE, false);
      gl.bindTexture(gl.TEXTURE_2D, this.paper.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      this.renderPaper();
    } catch (err) {
      console.warn('[ink] init failed', err);
      this.programs = null;
      this.ok = false;
      return;
    }

    this.ok = true;
    this.resize();
  }

  private renderPaper(): void {
    const gl = this.gl;
    const t = this.paper!;
    const p = this.programs!.paper;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.viewport(0, 0, t.w, t.h);
    gl.useProgram(p.program);
    gl.uniform2f(p.u.uRes, t.w, t.h);
    gl.uniform1f(p.u.uSeed, 11.7);
    drawFullscreen(gl, this.vao!);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private refreshTargets(): void {
    const gl = this.gl;
    const base = this.cssW * this.dpr;
    const simW = Math.max(280, Math.min(1024, Math.round(base * this.simScale * this.quality)));
    const simH = Math.max(280, Math.round(simW * (this.cssH / this.cssW)));
    const landW = Math.max(320, Math.round((this.cssW * this.dpr * 0.5)));
    const landH = Math.max(240, Math.round(landW * (this.cssH / this.cssW)));

    freeTarget(gl, this.inkA);
    freeTarget(gl, this.inkB);
    freeTarget(gl, this.land);
    this.inkA = makeTarget(gl, simW, simH, this.hdr);
    this.inkB = makeTarget(gl, simW, simH, this.hdr);
    this.land = makeTarget(gl, landW, landH, false);
    clearTarget(gl, this.inkA);
    clearTarget(gl, this.inkB);
    clearTarget(gl, this.land);
  }

  resize(): void {
    if (!this.ok) return;
    const isMobile = window.innerWidth < 768;
    // 画面本身是柔的，没必要按 2x 渲染；省下的像素给文字之外的滚动手感
    this.dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.25 : 1.5);
    this.cssW = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    this.cssH = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    const w = Math.round(this.cssW * this.dpr);
    const h = Math.round(this.cssH * this.dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.refreshTargets();
  }

  addStroke(s: Stroke): void {
    if (!this.ok) return;
    if (this.pending.length >= MAX_SEGMENTS) this.pending.shift();
    this.pending.push(s);
    this.wetFrames = 90;
  }

  setChapter(v: number): void {
    const prev = Math.round(this.chapter);
    this.chapter = v;
    // 换章时把上一章的墨洗掉，免得画面越画越脏
    if (Math.round(v) !== prev) this.flush = 1;
  }

  setScroll(p: number): void {
    this.scroll = p;
  }

  /** 形制框：c 为中心、s 为半尺寸，单位都以视口高度归一，x 已乘过宽高比。 */
  setFrame(c: [number, number], s: [number, number]): void {
    this.frameC = c;
    this.frameS = s;
  }

  private adaptive(dt: number): void {
    this.frameSamples.push(dt);
    if (this.frameSamples.length < 90) return;
    const avg = this.frameSamples.reduce((a, b) => a + b, 0) / this.frameSamples.length;
    this.frameSamples.length = 0;
    if (avg > 22 && this.quality > 0.55) {
      this.quality *= 0.8;
      this.refreshTargets();
    }
  }

  frame(dtMs: number): void {
    if (!this.ok || !this.programs) return;
    const gl = this.gl;
    const P = this.programs;
    const inkA = this.inkA!, inkB = this.inkB!, land = this.land!, paper = this.paper!;
    const dt = Math.min(dtMs, 48) / 16.667;
    this.time += dt * 0.0166;
    this.adaptive(dtMs);

    const n = this.pending.length;
    const inkActive = n > 0 || this.flush > 0 || this.wetFrames > 0;

    if (inkActive) {
      if (n > 0) {
        for (let i = 0; i < n; i++) {
          const s = this.pending[i];
          this.segBuf.set([s.x0, s.y0, s.x1, s.y1], i * 4);
          this.segBBuf.set([s.r, s.ink, s.dry, 0], i * 4);
        }
        this.pending.length = 0;
      }

      // 1. 落墨
      gl.bindFramebuffer(gl.FRAMEBUFFER, inkB.fbo);
      gl.viewport(0, 0, inkB.w, inkB.h);
      gl.useProgram(P.splat.program);
      bindTex(gl, 0, inkA.tex);
      gl.uniform1i(P.splat.u.uPrev, 0);
      gl.uniform2f(P.splat.u.uRes, inkB.w, inkB.h);
      gl.uniform1i(P.splat.u.uCount, n);
      if (n > 0) {
        gl.uniform4fv(P.splat.u.uSeg, this.segBuf);
        gl.uniform4fv(P.splat.u.uSegB, this.segBBuf);
      }
      drawFullscreen(gl, this.vao!);

      // 2. 渗化
      this.flush = Math.max(0, this.flush - 0.035 * dt);
      gl.bindFramebuffer(gl.FRAMEBUFFER, inkA.fbo);
      gl.viewport(0, 0, inkA.w, inkA.h);
      gl.useProgram(P.bleed.program);
      bindTex(gl, 0, inkB.tex);
      bindTex(gl, 1, paper.tex);
      gl.uniform1i(P.bleed.u.uInk, 0);
      gl.uniform1i(P.bleed.u.uPaper, 1);
      gl.uniform2f(P.bleed.u.uTexel, 1 / inkA.w, 1 / inkA.h);
      gl.uniform1f(P.bleed.u.uFlush, this.flush > 0 ? Math.min(0.9, this.flush * 0.22) : 0);
      drawFullscreen(gl, this.vao!);

      if (n === 0) this.wetFrames -= 1;
    }

    // 3. 山水
    gl.bindFramebuffer(gl.FRAMEBUFFER, land.fbo);
    gl.viewport(0, 0, land.w, land.h);
    gl.useProgram(P.land.program);
    gl.uniform2f(P.land.u.uRes, land.w, land.h);
    gl.uniform1f(P.land.u.uTime, this.time);
    gl.uniform1f(P.land.u.uScroll, this.scroll);
    gl.uniform1f(P.land.u.uChapter, this.chapter);
    gl.uniform2f(P.land.u.uFrameC, this.frameC[0], this.frameC[1]);
    gl.uniform2f(P.land.u.uFrameS, this.frameS[0], this.frameS[1]);
    drawFullscreen(gl, this.vao!);

    // 4. 合成
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(P.comp.program);
    bindTex(gl, 0, paper.tex);
    bindTex(gl, 1, inkA.tex);
    bindTex(gl, 2, land.tex);
    gl.uniform1i(P.comp.u.uPaper, 0);
    gl.uniform1i(P.comp.u.uInk, 1);
    gl.uniform1i(P.comp.u.uLand, 2);
    gl.uniform2f(P.comp.u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(P.comp.u.uChapter, this.chapter);
    gl.uniform1f(P.comp.u.uTime, this.time);
    gl.uniform2f(P.comp.u.uFrameC, this.frameC[0], this.frameC[1]);
    gl.uniform2f(P.comp.u.uFrameS, this.frameS[0], this.frameS[1]);
    drawFullscreen(gl, this.vao!);
  }

  dispose(): void {
    if (!this.ok) return;
    const gl = this.gl;
    freeTarget(gl, this.inkA);
    freeTarget(gl, this.inkB);
    freeTarget(gl, this.land);
    freeTarget(gl, this.paper);
    this.inkA = this.inkB = this.land = this.paper = null;
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.programs) for (const p of Object.values(this.programs)) gl.deleteProgram(p.program);
    this.programs = null;
  }
}
