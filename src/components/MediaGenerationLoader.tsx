import React, { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/utils';

interface MediaGenerationLoaderProps {
  type?: 'image' | 'video';
  progress?: number;
  className?: string;
}

export const MediaGenerationLoader: React.FC<MediaGenerationLoaderProps> = ({
  type = 'image',
  progress: controlledProgress,
  className,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoProgress, setAutoProgress] = useState(4);

  // Smooth asymptotic progress simulation when no explicit progress is provided
  useEffect(() => {
    if (typeof controlledProgress === 'number') return;

    const startTime = performance.now();
    const tau = type === 'video' ? 11000 : 4200; // ms time-constant
    let timerId: number;

    const tick = () => {
      const elapsed = performance.now() - startTime;
      const pct = Math.min(96, Math.max(3, Math.round(97 * (1 - Math.exp(-elapsed / tau)))));
      setAutoProgress(pct);
      timerId = window.setTimeout(tick, 180);
    };

    tick();
    return () => window.clearTimeout(timerId);
  }, [controlledProgress, type]);

  // Animated halftone blue dot-matrix wave on high-DPI canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let animationFrameId = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      width = Math.max(240, rect.width);
      height = Math.max(160, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    const renderFrame = (now: number) => {
      const t = prefersReducedMotion ? 0.6 : now * 0.001;
      ctx.clearRect(0, 0, width, height);

      // Subtle deep obsidian backdrop
      ctx.fillStyle = '#03050a';
      ctx.fillRect(0, 0, width, height);

      const cols = Math.max(18, Math.min(28, Math.floor(width / 17)));
      const rows = Math.max(12, Math.min(18, Math.floor(height / 17)));
      const padX = width * 0.07;
      const padY = height * 0.08;
      const stepX = (width - padX * 2) / Math.max(1, cols - 1);
      const stepY = (height - padY * 2) / Math.max(1, rows - 1);

      // Sweeping glowing wave biased slightly right like the reference aesthetic
      const waveCenterX = 0.66 + Math.sin(t * 1.15) * 0.24;
      const waveCenterY = 0.52 + Math.cos(t * 0.85) * 0.14;

      for (let r = 0; r < rows; r++) {
        const ny = r / Math.max(1, rows - 1);
        for (let c = 0; c < cols; c++) {
          const nx = c / Math.max(1, cols - 1);

          const dx = nx - waveCenterX;
          const dy = (ny - waveCenterY) * 0.9;
          const coreGlow = Math.exp(-(dx * dx * 3.4 + dy * dy * 2.2));
          const shimmer = 0.12 * Math.sin(nx * 5.2 - t * 2.4 + ny * 1.8);
          const rightBias = Math.pow(nx, 1.35) * 0.22;

          const intensity = Math.max(0.04, Math.min(1, coreGlow * 0.92 + rightBias + shimmer));

          const x = padX + c * stepX;
          const y = padY + r * stepY;
          const maxRadius = Math.min(stepX, stepY) * 0.27;
          const minRadius = 0.65;
          const radius = minRadius + (maxRadius - minRadius) * Math.pow(intensity, 1.15);

          // Royal blue -> luminous azure gradient per dot intensity
          const red = Math.round(14 + intensity * 38);
          const green = Math.round(58 + intensity * 84);
          const blue = Math.round(150 + intensity * 105);
          const alpha = 0.14 + intensity * 0.84;

          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha.toFixed(3)})`;
          ctx.fill();
        }
      }

      if (!prefersReducedMotion) {
        animationFrameId = window.requestAnimationFrame(renderFrame);
      }
    };

    animationFrameId = window.requestAnimationFrame(renderFrame);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
    };
  }, []);

  const displayPercent =
    typeof controlledProgress === 'number'
      ? Math.max(0, Math.min(100, Math.round(controlledProgress)))
      : autoProgress;

  return (
    <div
      ref={containerRef}
      role="status"
      aria-live="polite"
      aria-label={type === 'video' ? `Génération vidéo ${displayPercent}%` : `Génération d'image ${displayPercent}%`}
      className={cn(
        'relative w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-[#03050a] shadow-2xl select-none',
        type === 'video' ? 'aspect-video' : 'aspect-[4/3]',
        className
      )}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* Bottom-right floating percentage pill */}
      <div className="absolute bottom-3.5 right-3.5 px-3.5 py-1 rounded-full bg-[#131722]/90 backdrop-blur-md border border-white/[0.08] shadow-lg flex items-center justify-center">
        <span className="text-xs sm:text-[13px] font-semibold text-[#3b82f6] tabular-nums tracking-tight">
          {displayPercent} %
        </span>
      </div>
    </div>
  );
};
