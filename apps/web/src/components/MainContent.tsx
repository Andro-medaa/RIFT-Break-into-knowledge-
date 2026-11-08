/**
 * Main content area – RIFT branding + upload input box.
 *
 * Cosmic Obsidian & Violet Glass Theme:
 * • Glass panel (67% width) with backdrop blur and subtle glowing border.
 * • Vertically centered single image logo + upload box.
 * • Clean, minimal, zero unnecessary text above the instruction box.
 */

"use client";

import { motion } from "framer-motion";
import UploadBox from "./UploadBox";
import { useRift } from "@/lib/store";

export default function MainContent() {
  const { error, setError } = useRift();

  return (
    <motion.main
      className="glass-panel"
      initial={{ opacity: 0, x: 32, scale: 0.985 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      whileHover={{
        borderColor: "rgba(99, 102, 241, 0.32)",
        boxShadow:
          "0 20px 50px -10px rgba(0, 0, 0, 0.65), 0 0 28px rgba(99, 102, 241, 0.2)",
      }}
      transition={{
        duration: 0.65,
        delay: 0.08,
        ease: [0.16, 1, 0.3, 1],
      }}
      style={{
        flex: 1,
        height: "100%",
        borderRadius: "26px",
        background: "rgba(15, 23, 42, 0.72)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
        boxShadow: "0 12px 40px rgba(0, 0, 0, 0.45)",
      }}
    >
      {/* Top cosmic shimmer highlight line */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          left: "15%",
          right: "15%",
          height: "1px",
          background:
            "linear-gradient(90deg, transparent, rgba(99, 102, 241, 0.6), rgba(168, 85, 247, 0.5), transparent)",
          pointerEvents: "none",
        }}
      />

      {/* Ambient glowing background orbs with gentle cosmic pulsation */}
      <motion.div
        aria-hidden
        animate={{
          scale: [1, 1.08, 1],
          opacity: [0.75, 0.95, 0.75],
        }}
        transition={{
          duration: 7,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        style={{
          position: "absolute",
          top: "32%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "520px",
          height: "520px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(99, 102, 241, 0.16) 0%, rgba(139, 92, 246, 0.07) 45%, transparent 70%)",
          pointerEvents: "none",
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
        {/* ── Single Image Logo (Resized to perfect sleek size with gentle float) ── */}
        <motion.div
          initial={{ opacity: 0, y: -12, scale: 0.95 }}
          animate={{
            opacity: 1,
            scale: 1,
            y: [0, -6, 0],
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
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            userSelect: "none",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/rift-logo.jpg"
            alt="RIFT - The Mystical Reader"
            style={{
              width: "clamp(150px, 16vw, 195px)",
              height: "auto",
              maxHeight: "175px",
              objectFit: "contain",
              mixBlendMode: "screen",
              filter: "drop-shadow(0 0 28px rgba(139, 92, 246, 0.45))",
              pointerEvents: "none",
            }}
          />
        </motion.div>

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
