/**
 * SpiralGalaxiesBackground – High-DPI interactive spiral galaxy grid canvas.
 *
 * Adapted from the spiral galaxy engine in background reference.html and tuned
 * for RIFT's Deep Teal & Jet Black cosmic theme:
 * - Mounted directly inside the visible front panels of the Home page
 * - Tiny logarithmic twin-arm spiral galaxies on a dense 20px lattice
 * - Smooth cursor-tracking spotlight (~230px radius) with teal/cyan radial aura
 * - Subtle jet-black theme base opacity (~0.18) that ignites smoothly up to
 *   luminous cyan/teal/aquamarine (~0.95) with boosted orbital spin under hover
 * - Zero non-galaxy elements, controls, or text; pointer-events-none behind content
 */

"use client";

import { useEffect, useRef } from "react";

interface GalaxyPalette {
  arm1: string;
  arm2: string;
  core: string;
  glow: string;
}

interface GalaxyNode {
  x: number;
  y: number;
  paletteIdx: number;
  rotationOffset: number;
  extraAngle: number;
}

const GRID_SPACING = 20;
const SPOTLIGHT_RADIUS = 230;
const BASE_RADIUS = 1.45;
const ACTIVE_RADIUS = 4.2;
const BASE_ALPHA = 0.18;
const ACTIVE_ALPHA = 0.95;
const IDLE_SPIN_SPEED = 0.55;
const HOVER_SPIN_BOOST = 1.45;
const ARM_COUNT = 2;
const SPIRAL_STEPS = 9;
const IDLE_SPRITE_SIZE = 12;
const LIT_SPRITE_SIZE = 36;
const LIT_LEVELS = 10;

/** RIFT Jet-Black & Deep Teal / Cyan / Aquamarine palette variants */
const GALAXY_PALETTES: GalaxyPalette[] = [
  {
    arm1: "#00f5d4",
    arm2: "#0d9488",
    core: "#ccfbf1",
    glow: "rgba(0, 245, 212, 0.75)",
  },
  {
    arm1: "#2dd4bf",
    arm2: "#0284c7",
    core: "#67e8f9",
    glow: "rgba(45, 212, 191, 0.70)",
  },
  {
    arm1: "#5eead4",
    arm2: "#10b981",
    core: "#a7f3d0",
    glow: "rgba(94, 234, 212, 0.70)",
  },
  {
    arm1: "#38bdf8",
    arm2: "#00f5d4",
    core: "#e0f2fe",
    glow: "rgba(56, 189, 248, 0.70)",
  },
];

/** Deterministic coordinate hash matching the reference engine */
function coordHash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) ^ 0x5bf03635;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Draw one twin-arm logarithmic spiral galaxy centered at local (0, 0) */
function drawGalaxyShape(
  ctx: CanvasRenderingContext2D,
  pal: GalaxyPalette,
  factor: number,
  alpha: number
) {
  const maxRadius = BASE_RADIUS + factor * (ACTIVE_RADIUS - BASE_RADIUS);

  ctx.globalAlpha = alpha;

  if (factor > 0.2) {
    ctx.shadowBlur = 10 * factor;
    ctx.shadowColor = pal.glow;
  }

  for (let a = 0; a < ARM_COUNT; a++) {
    const armAngleOffset = a * Math.PI;
    ctx.fillStyle = a === 0 ? pal.arm1 : pal.arm2;

    for (let s = 1; s <= SPIRAL_STEPS; s++) {
      const progress = s / SPIRAL_STEPS;
      const theta = armAngleOffset + progress * 2.5;
      const dist = progress * maxRadius;
      const px = Math.cos(theta) * dist;
      const py = Math.sin(theta) * dist * 0.65;
      const dotSize = (1 - progress * 0.5) * (0.34 + factor * 0.42);

      ctx.beginPath();
      ctx.arc(px, py, dotSize, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Luminous vortex core
  ctx.fillStyle = factor > 0.25 ? "#ffffff" : pal.core;
  ctx.beginPath();
  ctx.arc(0, 0, 0.55 + factor * 0.75, 0, Math.PI * 2);
  ctx.fill();
}

function createGalaxySprite(
  pal: GalaxyPalette,
  size: number,
  dpr: number,
  factor: number,
  alpha: number
): HTMLCanvasElement {
  const offscreen = document.createElement("canvas");
  offscreen.width = Math.ceil(size * dpr);
  offscreen.height = Math.ceil(size * dpr);
  const octx = offscreen.getContext("2d");
  if (octx) {
    octx.setTransform(dpr, 0, 0, dpr, (size * dpr) / 2, (size * dpr) / 2);
    drawGalaxyShape(octx, pal, factor, alpha);
  }
  return offscreen;
}

/** Pre-render idle and glow-baked lit sprite canvases once per DPR (eliminates runtime shadowBlur) */
function buildIdleSprites(dpr: number): HTMLCanvasElement[] {
  return GALAXY_PALETTES.map((pal) =>
    createGalaxySprite(pal, IDLE_SPRITE_SIZE, dpr, 0, BASE_ALPHA)
  );
}

function buildLitSprites(dpr: number): HTMLCanvasElement[][] {
  return GALAXY_PALETTES.map((pal) =>
    Array.from({ length: LIT_LEVELS }, (_, level) =>
      createGalaxySprite(pal, LIT_SPRITE_SIZE, dpr, (level + 0.5) / LIT_LEVELS, 1)
    )
  );
}

export default function SpiralGalaxiesBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const prefersReducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = canvas.clientWidth || canvas.parentElement?.clientWidth || window.innerWidth;
    let height = canvas.clientHeight || canvas.parentElement?.clientHeight || window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let galaxies: GalaxyNode[] = [];
    let litIndices = new Int32Array(512);
    let idleSprites: HTMLCanvasElement[] = buildIdleSprites(dpr);
    let litSprites: HTMLCanvasElement[][] = buildLitSprites(dpr);
    let cachedRect = canvas.getBoundingClientRect();

    const mouse = {
      x: -2000,
      y: -2000,
      targetX: -2000,
      targetY: -2000,
    };

    const refreshRect = () => {
      cachedRect = canvas.getBoundingClientRect();
    };

    const buildGrid = () => {
      galaxies = [];
      const cols = Math.ceil(width / GRID_SPACING);
      const rows = Math.ceil(height / GRID_SPACING);

      for (let i = 0; i <= cols; i++) {
        for (let j = 0; j <= rows; j++) {
          const gx = i * GRID_SPACING + GRID_SPACING / 2;
          const gy = j * GRID_SPACING + GRID_SPACING / 2;
          const r2 = coordHash(j, i);
          const r3 = coordHash(i * 3, j * 7);

          galaxies.push({
            x: gx,
            y: gy,
            paletteIdx: Math.floor(r3 * 100) % GALAXY_PALETTES.length,
            rotationOffset: r2 * Math.PI * 2,
            extraAngle: 0,
          });
        }
      }
      if (litIndices.length < galaxies.length) {
        litIndices = new Int32Array(galaxies.length);
      }
    };

    const resize = () => {
      refreshRect();
      const nextWidth = canvas.clientWidth || canvas.parentElement?.clientWidth || window.innerWidth;
      const nextHeight = canvas.clientHeight || canvas.parentElement?.clientHeight || window.innerHeight;
      const nextDpr = Math.min(window.devicePixelRatio || 1, 1.5);
      if (nextWidth === width && nextHeight === height && nextDpr === dpr && galaxies.length > 0) {
        return;
      }
      width = nextWidth;
      height = nextHeight;
      if (nextDpr !== dpr) {
        dpr = nextDpr;
        idleSprites = buildIdleSprites(dpr);
        litSprites = buildLitSprites(dpr);
      }
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildGrid();
    };

    const updateTargetFromClient = (clientX: number, clientY: number) => {
      const scaleX = cachedRect.width > 0 ? width / cachedRect.width : 1;
      const scaleY = cachedRect.height > 0 ? height / cachedRect.height : 1;
      mouse.targetX = (clientX - cachedRect.left) * scaleX;
      mouse.targetY = (clientY - cachedRect.top) * scaleY;
      if (mouse.x === -2000) {
        mouse.x = mouse.targetX;
        mouse.y = mouse.targetY;
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      updateTargetFromClient(e.clientX, e.clientY);
    };

    const handleMouseLeave = () => {
      mouse.targetX = -2000;
      mouse.targetY = -2000;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        updateTargetFromClient(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    resize();

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(canvas);
    }

    window.addEventListener("resize", resize);
    window.addEventListener("scroll", refreshRect, { passive: true, capture: true });
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    document.addEventListener("mouseleave", handleMouseLeave);
    window.addEventListener("blur", handleMouseLeave);
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleMouseLeave, { passive: true });

    let idlePhase = 0;
    let rafId = 0;
    let lastTimestamp = performance.now();
    const radiusSq = SPOTLIGHT_RADIUS * SPOTLIGHT_RADIUS;
    const halfIdleSprite = IDLE_SPRITE_SIZE / 2;
    const halfLitSprite = LIT_SPRITE_SIZE / 2;

    const renderFrame = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTimestamp) / 1000));
      lastTimestamp = now;

      if (!prefersReducedMotion) {
        idlePhase += dt * IDLE_SPIN_SPEED;
      }

      // Smooth cursor lerp matching reference feel
      if (mouse.targetX <= -1500) {
        mouse.x = -2000;
        mouse.y = -2000;
      } else {
        mouse.x += (mouse.targetX - mouse.x) * 0.18;
        mouse.y += (mouse.targetY - mouse.y) * 0.18;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const cursorNear =
        mouse.x > -SPOTLIGHT_RADIUS &&
        mouse.y > -SPOTLIGHT_RADIUS &&
        mouse.x < width + SPOTLIGHT_RADIUS &&
        mouse.y < height + SPOTLIGHT_RADIUS;

      // Spotlight ambient aura centered on smoothed cursor
      if (cursorNear) {
        const radialGlow = ctx.createRadialGradient(
          mouse.x,
          mouse.y,
          0,
          mouse.x,
          mouse.y,
          SPOTLIGHT_RADIUS
        );
        radialGlow.addColorStop(0, "rgba(0, 245, 212, 0.13)");
        radialGlow.addColorStop(0.45, "rgba(13, 148, 136, 0.06)");
        radialGlow.addColorStop(1, "rgba(0, 0, 0, 0)");

        ctx.globalAlpha = 1;
        ctx.fillStyle = radialGlow;
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, SPOTLIGHT_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      }

      // Pass 1: Fast sprite blitting for all idle galaxies outside spotlight aura
      let litCount = 0;
      ctx.globalAlpha = 1;
      for (let i = 0; i < galaxies.length; i++) {
        const g = galaxies[i];
        if (cursorNear) {
          const dx = g.x - mouse.x;
          if (dx > -SPOTLIGHT_RADIUS && dx < SPOTLIGHT_RADIUS) {
            const dy = g.y - mouse.y;
            if (dy > -SPOTLIGHT_RADIUS && dy < SPOTLIGHT_RADIUS && dx * dx + dy * dy < radiusSq) {
              litIndices[litCount++] = i;
              continue;
            }
          }
        }

        const rot = g.rotationOffset + idlePhase + g.extraAngle;
        const cos = Math.cos(rot) * dpr;
        const sin = Math.sin(rot) * dpr;
        ctx.setTransform(cos, sin, -sin, cos, g.x * dpr, g.y * dpr);
        ctx.drawImage(
          idleSprites[g.paletteIdx],
          -halfIdleSprite,
          -halfIdleSprite,
          IDLE_SPRITE_SIZE,
          IDLE_SPRITE_SIZE
        );
      }

      // Pass 2: Blit glow-baked luminous sprites inside the 230px cursor spotlight (zero shadowBlur)
      for (let k = 0; k < litCount; k++) {
        const g = galaxies[litIndices[k]];
        const dx = g.x - mouse.x;
        const dy = g.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const factor = Math.cos((dist / SPOTLIGHT_RADIUS) * (Math.PI / 2));
        const level = Math.min(LIT_LEVELS - 1, Math.max(0, Math.floor(factor * LIT_LEVELS)));

        if (!prefersReducedMotion) {
          g.extraAngle += dt * factor * HOVER_SPIN_BOOST;
        }

        const rot = g.rotationOffset + idlePhase + g.extraAngle;
        const cos = Math.cos(rot) * dpr;
        const sin = Math.sin(rot) * dpr;
        ctx.globalAlpha = BASE_ALPHA + factor * (ACTIVE_ALPHA - BASE_ALPHA);
        ctx.setTransform(cos, sin, -sin, cos, g.x * dpr, g.y * dpr);
        ctx.drawImage(
          litSprites[g.paletteIdx][level],
          -halfLitSprite,
          -halfLitSprite,
          LIT_SPRITE_SIZE,
          LIT_SPRITE_SIZE
        );
      }

      if (!prefersReducedMotion) {
        rafId = requestAnimationFrame(renderFrame);
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = 0;
        }
      } else if (!prefersReducedMotion && !rafId) {
        lastTimestamp = performance.now();
        rafId = requestAnimationFrame(renderFrame);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    rafId = requestAnimationFrame(renderFrame);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", refreshRect, { capture: true });
      window.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("blur", handleMouseLeave);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleMouseLeave);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 0,
        willChange: "transform",
        contain: "strict",
        transform: "translateZ(0)",
      }}
    />
  );
}
