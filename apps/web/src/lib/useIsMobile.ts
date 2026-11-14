"use client";

import { useEffect, useState } from "react";

export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const update = () => setIsMobile(mql.matches);
    update();

    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", update);
      return () => mql.removeEventListener("change", update);
    } else {
      // Fallback for older browsers
      mql.addListener(update);
      return () => mql.removeListener(update);
    }
  }, [breakpoint]);

  return isMobile;
}
