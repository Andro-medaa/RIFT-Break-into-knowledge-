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
        <div className="flex-1 h-full rounded-[28px] bg-[#111111] border border-[#858585]/40 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full border-2 border-[#B66BC5]/30 border-t-[#B66BC5] animate-spin" />
            <p className="text-[#999999]/50 text-sm">Loading…</p>
          </div>
        </div>
      }
    >
      <ChatPageContent params={params} />
    </Suspense>
  );
}
