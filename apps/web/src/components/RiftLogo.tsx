/**
 * RIFT crystal logo – geometric diamond inside a circle.
 * Deep Teal & Dark Jet Black Theme.
 */

"use client";

interface RiftLogoProps {
  size?: number;
  className?: string;
}

export default function RiftLogo({ size = 64, className = "" }: RiftLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="RIFT Logo"
    >
      {/* Outer circle – dark jet black / deep teal */}
      <circle cx="50" cy="50" r="48" fill="#041f22" stroke="#00f5d4" strokeWidth="1.5" />

      {/* Inner glow */}
      <circle cx="50" cy="50" r="36" fill="url(#innerGlow)" opacity="0.4" />

      {/* Crystal diamond – main shape */}
      <path
        d="M50 14 L72 38 L50 86 L28 38 Z"
        fill="url(#crystalGrad)"
        stroke="#5eead4"
        strokeWidth="1"
        opacity="0.9"
      />

      {/* Crystal facet lines */}
      <path d="M50 14 L50 86" stroke="#5eead4" strokeWidth="0.5" opacity="0.6" />
      <path d="M28 38 L72 38" stroke="#5eead4" strokeWidth="0.5" opacity="0.6" />

      {/* Left facet highlight */}
      <path
        d="M50 14 L28 38 L50 52 Z"
        fill="#5eead4"
        opacity="0.25"
      />

      {/* Right facet highlight */}
      <path
        d="M50 14 L72 38 L50 52 Z"
        fill="#00f5d4"
        opacity="0.2"
      />

      {/* Bottom-left facet */}
      <path
        d="M28 38 L50 86 L50 52 Z"
        fill="#0d9488"
        opacity="0.18"
      />

      {/* Small inner diamond accent */}
      <path
        d="M50 28 L60 40 L50 62 L40 40 Z"
        fill="none"
        stroke="#5eead4"
        strokeWidth="0.6"
        opacity="0.5"
      />

      <defs>
        <radialGradient id="innerGlow" cx="50%" cy="40%" r="50%">
          <stop offset="0%" stopColor="#00f5d4" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#020d10" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="crystalGrad" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#5eead4" stopOpacity="0.7" />
          <stop offset="50%" stopColor="#00f5d4" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#042f2e" stopOpacity="0.3" />
        </linearGradient>
      </defs>
    </svg>
  );
}

