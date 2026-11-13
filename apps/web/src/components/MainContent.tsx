/**
 * Main content area – RIFT branding + upload input box.
 *
 * Deep Teal & Dark Jet Black Theme:
 * • Glass panel (67% width) with backdrop blur and luminous teal border.
 * • Vertically centered single image logo + upload box.
 * • Clean, minimal, zero unnecessary text above the instruction box.
 */

"use client";

import { motion } from "framer-motion";
import UploadBox from "./UploadBox";
import SpiralGalaxiesBackground from "./SpiralGalaxiesBackground";
import { useRift } from "@/lib/store";

export default function MainContent() {
  const { error, setError } = useRift();

  return (
    <motion.main
      className="glass-panel"
      initial={{ opacity: 0, x: 32, scale: 0.985 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{
        duration: 0.65,
        delay: 0.08,
        ease: [0.16, 1, 0.3, 1],
      }}
      style={{
        flex: 1,
        height: "100%",
        borderRadius: "26px",
        background: "rgba(3, 8, 12, 0.92)",
        backdropFilter: "none",
        WebkitBackdropFilter: "none",
        border: "1px solid rgba(0, 245, 212, 0.14)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
        boxShadow: "0 16px 50px rgba(0, 0, 0, 0.75)",
        contain: "layout paint",
      }}
    >
      {/* Interactive Spiral Galaxies on the visible Home front layer */}
      <SpiralGalaxiesBackground />

      {/* Top teal shimmer highlight line */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          left: "15%",
          right: "15%",
          height: "1.5px",
          background:
            "linear-gradient(90deg, transparent, rgba(0, 245, 212, 0.85), rgba(13, 148, 136, 0.7), transparent)",
          pointerEvents: "none",
          zIndex: 2,
        }}
      />

      {/* Inner content wrapper */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "22px",
          width: "100%",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* ── Logo & centered rotating celestial circle wrapper ── */}
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Ambient glowing deep teal nebula centered on the logo */}
          <motion.div
            aria-hidden
            animate={{
              scale: [1, 1.07, 1],
              opacity: [0.65, 0.9, 0.65],
            }}
            transition={{
              duration: 6.5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: "560px",
              height: "560px",
              marginTop: "-280px",
              marginLeft: "-280px",
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(0, 245, 212, 0.14) 0%, rgba(13, 148, 136, 0.08) 45%, transparent 70%)",
              pointerEvents: "none",
              zIndex: 0,
            }}
          />

          {/* Subtle outer celestial aura ring locked to the logo center */}
          <motion.div
            aria-hidden
            animate={{ rotate: 360 }}
            transition={{ duration: 45, repeat: Infinity, ease: "linear" }}
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: "280px",
              height: "280px",
              marginTop: "-140px",
              marginLeft: "-140px",
              borderRadius: "50%",
              border: "1px dashed rgba(0, 245, 212, 0.18)",
              pointerEvents: "none",
              zIndex: 0,
            }}
          />

          {/* Single Image Logo centered symmetrically inside the circle */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{
              opacity: 1,
              scale: 1,
              y: [-3, 3, -3],
            }}
            transition={{
              y: {
                repeat: Infinity,
                duration: 4.5,
                ease: "easeInOut",
              },
              opacity: { duration: 0.6, ease: "easeOut" },
              scale: { duration: 0.6, ease: "easeOut" },
            }}
            style={{
              position: "relative",
              zIndex: 1,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              userSelect: "none",
              willChange: "transform",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/rift-logo.png"
              alt="RIFT - The Mystical Reader"
              style={{
                width: "clamp(160px, 17vw, 210px)",
                height: "auto",
                maxHeight: "190px",
                objectFit: "contain",
                filter: "drop-shadow(0 0 35px rgba(0, 245, 212, 0.42))",
                pointerEvents: "none",
              }}
            />
          </motion.div>
        </div>

        {/* ── Upload box — centred inside this column ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }}
          style={{
            display: "flex",
            justifyContent: "center",
            width: "100%",
            padding: "0 32px",
          }}
        >
          <UploadBox />
        </motion.div>
      </div>

      {/* ── Error toast ── */}
      {error && (
        <div
          className="animate-fade-in-up"
          style={{
            position: "absolute",
            bottom: "32px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(225, 29, 72, 0.18)",
            border: "1px solid rgba(244, 63, 94, 0.4)",
            color: "#fda4af",
            padding: "11px 36px 11px 20px",
            borderRadius: "18px",
            fontSize: "13.5px",
            zIndex: 20,
            maxWidth: "440px",
            textAlign: "center",
            backdropFilter: "blur(12px)",
          }}
        >
          <button
            onClick={() => setError(null)}
            style={{
              position: "absolute",
              top: "6px",
              right: "12px",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "17px",
              color: "rgba(253, 164, 175, 0.8)",
              lineHeight: 1,
            }}
          >
            ×
          </button>
          {error}
        </div>
      )}
    </motion.main>
  );
}
