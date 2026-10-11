import type { Metadata } from "next";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "RIFT — AI Teacher PDF Narrator",
  description: "Dual-source grounded AI PDF Dictator and Voice Tutor with real-time text highlighting and voice interaction.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body>{children}</body>
    </html>
  );
}
