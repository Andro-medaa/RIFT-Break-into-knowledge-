/**
 * WaveformAnimation – animated bars that pulse while audio is active.
 * Purely CSS-driven, no Web Audio API needed.
 */
"use client";

interface WaveformProps {
  active: boolean;
  bars?: number;
  color?: string;
  height?: number;
}

export default function WaveformAnimation({
  active,
  bars = 18,
  color = "#B66BC5",
  height = 32,
}: WaveformProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "3px",
        height: `${height}px`,
      }}
      aria-hidden
    >
      {Array.from({ length: bars }).map((_, i) => {
        const delay = (i * 0.07) % 0.9;
        const h = active
          ? `${20 + Math.sin(i * 1.1) * 60}%`
          : "15%";

        return (
          <div
            key={i}
            style={{
              width: "3px",
              height: active ? `${10 + ((i * 17) % 70)}%` : "15%",
              background: color,
              borderRadius: "2px",
              opacity: active ? 0.85 : 0.3,
              transition: `height 0.15s ease ${delay}s, opacity 0.3s ease`,
              animation: active
                ? `waveBar 0.9s ease-in-out ${delay}s infinite alternate`
                : "none",
              minHeight: "3px",
            }}
          />
        );
      })}

      <style>{`
        @keyframes waveBar {
          from { transform: scaleY(0.35); }
          to   { transform: scaleY(1); }
        }
      `}</style>
    </div>
  );
}

