/**
 * WaveformAnimation – animated audio equalizer bars that pulse while voice/audio is active.
 * Inspired by RIFT-Break-into-knowledge-, styled in RIFT Cyber-Minimalist Electric Teal.
 * Purely CSS-driven, zero CPU overhead.
 */
"use client";

interface WaveformProps {
  active: boolean;
  bars?: number;
  color?: string;
  gradient?: string;
  glow?: boolean;
  height?: number;
  barWidth?: number;
  gap?: number;
}

export default function WaveformAnimation({
  active,
  bars = 14,
  color = "#00f5d4",
  gradient,
  glow = true,
  height = 20,
  barWidth = 2.5,
  gap = 2.5,
}: WaveformProps) {
  // Natural vocal formant weights (higher in mid/upper-mid frequencies)
  const weights = [0.35, 0.6, 0.85, 1.0, 0.75, 0.95, 0.65, 0.82, 0.52, 0.74, 0.9, 0.58];

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: `${gap}px`,
        height: `${height}px`,
      }}
      aria-hidden
    >
      {Array.from({ length: bars }).map((_, i) => {
        const weight = weights[i % weights.length];
        const delay = (i * 0.08) % 0.85;
        const duration = 0.55 + ((i * 0.11) % 0.45);
        const barHeightPct = active ? Math.max(25, Math.round(weight * 100)) : 16;
        const bg = gradient || color;

        return (
          <div
            key={i}
            style={{
              width: `${barWidth}px`,
              height: `${barHeightPct}%`,
              background: bg,
              borderRadius: "2px",
              opacity: active ? 0.95 : 0.35,
              boxShadow: active && glow ? `0 0 8px ${color}` : "none",
              animation: active
                ? `riftWaveBar ${duration}s ease-in-out ${delay}s infinite alternate`
                : "none",
              minHeight: "3px",
              transformOrigin: "center",
              transition: "opacity 0.2s ease, height 0.2s ease",
            }}
          />
        );
      })}

      <style>{`
        @keyframes riftWaveBar {
          0% {
            transform: scaleY(0.28);
          }
          50% {
            transform: scaleY(0.85);
          }
          100% {
            transform: scaleY(1.15);
          }
        }
      `}</style>
    </div>
  );
}


