/**
 * RIFT Home Page
 *
 * Two-panel layout:
 * - Left: PDF History Sidebar (33%)
 * - Right: Main Content with branding & upload (67%)
 */

"use client";

import { Suspense } from "react";
import Sidebar from "@/components/Sidebar";
import MainContent from "@/components/MainContent";

export default function HomePage() {
  return (
    <>
      <Suspense>
        <Sidebar />
      </Suspense>
      <Suspense>
        <MainContent />
      </Suspense>
    </>
  );
}
