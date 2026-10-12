'use client';

import React, { useRef, useEffect } from 'react';

interface WaveformProps {
  analyser: AnalyserNode | null;
  isPlaying: boolean;
  emotionColor?: string;
  width?: number;
  height?: number;
}

export const Waveform: React.FC<WaveformProps> = ({
  analyser,
  isPlaying,
  emotionColor = '#38bdf8',
  width = 280,
  height = 42,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const barCount = 32;
    const dataArray = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    let idlePhase = 0;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      const barWidth = Math.floor(width / barCount) - 2;

      if (isPlaying && analyser && dataArray) {
        analyser.getByteFrequencyData(dataArray);

        for (let i = 0; i < barCount; i++) {
          // Sample across lower and middle vocal frequencies
          const binIndex = Math.min(
            dataArray.length - 1,
            Math.floor((i / barCount) * (dataArray.length * 0.45))
          );
          const rawVal = dataArray[binIndex] || 0;
          const normalized = rawVal / 255;
          const barHeight = Math.max(3, normalized * (height - 4));

          const x = i * (barWidth + 2);
          const y = height - barHeight;

          // Gradient fill
          const grad = ctx.createLinearGradient(0, y, 0, height);
          grad.addColorStop(0, emotionColor);
          grad.addColorStop(1, 'rgba(56, 189, 248, 0.25)');

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, 2);
          ctx.fill();

          // Subtle glow
          ctx.shadowColor = emotionColor;
          ctx.shadowBlur = normalized > 0.4 ? 6 : 0;
        }
      } else {
        // Idle gentle breathing wave animation
        idlePhase += 0.04;
        for (let i = 0; i < barCount; i++) {
          const wave = Math.sin(idlePhase + (i * 0.25));
          const barHeight = Math.max(3, 4 + wave * 3);
          const x = i * (barWidth + 2);
          const y = height - barHeight;

          ctx.fillStyle = 'rgba(148, 163, 184, 0.25)';
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, 1.5);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [analyser, isPlaying, emotionColor, width, height]);

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2px 8px',
        background: 'rgba(15, 23, 42, 0.6)',
        borderRadius: '8px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ display: 'block' }}
      />
    </div>
  );
};
