/**
 * Chat page – displayed after a PDF is uploaded.
 *
 * Shows the uploaded document info and a placeholder chat interface.
 */

import { Suspense } from "react";
import ChatPageContent from "./ChatPageContent";

/** Allow this dynamic route to block on runtime data (params). */
export const dynamic = "force-dynamic";

export default function ChatPage({
  params,
}: {
  params: Promise<{ docId: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex-1 h-full rounded-[28px] bg-[#020406] border border-[#00f5d4]/20 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full border-2 border-[#00f5d4]/20 border-t-[#00f5d4] animate-spin" />
            <p className="text-[#94a3b8] text-sm">Loading…</p>
          </div>
        </div>
      }
    >
      <ChatPageContent params={params} />
    </Suspense>
  );
}
