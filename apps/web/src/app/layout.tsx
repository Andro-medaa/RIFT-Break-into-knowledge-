import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";
import { RiftProvider } from "@/lib/store";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "RIFT — AI Teacher PDF Narrator",
  description:
    "Intelligent PDF reading, synchronized highlighting, lesson plans, and voice interaction.",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${nunito.variable} h-full`}>
      <body className="h-full overflow-hidden font-[family-name:var(--font-nunito)]">
        <RiftProvider>
          {/*
           * This wrapper provides the padding + flex container for ALL pages.
           * Home page: Sidebar (33%) + MainContent (67%) sit inside here.
           * Chat/workspace page: layout.tsx overrides to full-width.
           */}
          <div className="rift-root-container">
            {children}
          </div>
        </RiftProvider>
      </body>
    </html>
  );
}
