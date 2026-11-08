/**
 * Framer Motion page transition wrapper.
 * Provides smooth fade + slide animation when entering a page.
 */

"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

export default function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15, scale: 0.99 }}
      animate={{
        opacity: 1,
        y: 0,
        scale: 1,
        transition: {
          duration: 0.3,
          ease: "easeOut",
        },
      }}
      className="flex-1 flex w-full h-full min-h-0 min-w-0 overflow-hidden"
    >
      {children}
    </motion.div>
  );
}
