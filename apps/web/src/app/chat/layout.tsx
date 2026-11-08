/**
 * Chat layout — workspace view.
 *
 * The workspace needs full viewport height with no sidebar.
 * The sidebar is hidden in workspace mode so the PDF, Transcript and
 * RAG panels can use the full width.
 */

"use client";

import PageTransition from "@/components/PageTransition";

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    /*
     * We deliberately hide the History sidebar in workspace mode.
     * The workspace is opened full-width from within the sidebar via
     * the PDF card click on the home page.
     * The back-arrow inside ChatPageContent navigates back to "/".
     */
    <PageTransition>{children}</PageTransition>
  );
}
