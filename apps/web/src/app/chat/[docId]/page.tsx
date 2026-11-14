/**
 * Chat page – displayed after a PDF is uploaded.
 *
 * Shows the uploaded document info and a placeholder chat interface.
 */

import { Suspense } from "react";
import ChatPageContent from "./ChatPageContent";
import { CyberMascotLoader } from "@/components/common/CyberMascotLoader";

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
        <div className="flex-1 h-full rounded-[28px] bg-[#020406] border border-[#00f5d4]/20 flex items-center justify-center p-6">
          <CyberMascotLoader
            size="lg"
            title="Initializing RIFT Neural Link…"
            subtitle="Preparing workspace environment and knowledge nodes"
          />
        </div>
      }
    >
      <ChatPageContent params={params} />
    </Suspense>
  );
}
