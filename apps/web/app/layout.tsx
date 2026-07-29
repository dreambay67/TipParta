import type { Metadata } from "next";
import { TvShell } from "@/components/TvShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "TipParta",
  description: "TipParta is preparing its next tournament."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sk">
      <body>
        <TvShell>{children}</TvShell>
      </body>
    </html>
  );
}
