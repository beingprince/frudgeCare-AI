import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/common/AppShell";
import { MuiProvider } from "@/components/providers/MuiProvider";
import { CommandPalette } from "@/components/common/CommandPalette";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "FrudgeCare — Care coordination",
  description:
    "From intake to the care team: triage, nursing handoff, and provider follow-up in one flow (demo).",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-full">
        <MuiProvider>
          <AppShell>{children}</AppShell>
          {/* Global Cmd/Ctrl+K AI navigation palette. Mounted once at root
              so every page (including /triage and /console) can summon it. */}
          <CommandPalette />
        </MuiProvider>
      </body>
    </html>
  );
}
