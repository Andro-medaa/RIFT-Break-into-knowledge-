/**
 * RIFT crystal logo – geometric diamond inside a circle.
 * Pure SVG, no external assets needed.
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
      {/* Outer circle – dark purple */}
      <circle cx="50" cy="50" r="48" fill="#33203F" stroke="#B66BC5" strokeWidth="1.5" />

      {/* Inner glow */}
      <circle cx="50" cy="50" r="36" fill="url(#innerGlow)" opacity="0.3" />

      {/* Crystal diamond – main shape */}
      <path
        d="M50 14 L72 38 L50 86 L28 38 Z"
        fill="url(#crystalGrad)"
        stroke="#D8BCE0"
        strokeWidth="1"
        opacity="0.9"
      />

      {/* Crystal facet lines */}
      <path d="M50 14 L50 86" stroke="#D8BCE0" strokeWidth="0.5" opacity="0.5" />
      <path d="M28 38 L72 38" stroke="#D8BCE0" strokeWidth="0.5" opacity="0.5" />

      {/* Left facet highlight */}
      <path
        d="M50 14 L28 38 L50 52 Z"
        fill="#D8BCE0"
        opacity="0.15"
      />

      {/* Right facet highlight */}
      <path
        d="M50 14 L72 38 L50 52 Z"
        fill="#B66BC5"
        opacity="0.12"
      />

      {/* Bottom-left facet */}
      <path
        d="M28 38 L50 86 L50 52 Z"
        fill="#A568B5"
        opacity="0.1"
      />

      {/* Small inner diamond accent */}
      <path
        d="M50 28 L60 40 L50 62 L40 40 Z"
        fill="none"
        stroke="#D8BCE0"
        strokeWidth="0.6"
        opacity="0.4"
      />

      <defs>
        <radialGradient id="innerGlow" cx="50%" cy="40%" r="50%">
          <stop offset="0%" stopColor="#D8BCE0" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#33203F" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="crystalGrad" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#D8BCE0" stopOpacity="0.6" />
          <stop offset="50%" stopColor="#B66BC5" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#33203F" stopOpacity="0.2" />
        </linearGradient>
      </defs>
    </svg>
  );
}

