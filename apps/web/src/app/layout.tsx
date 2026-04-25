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
  title: "FrudgeCare • Clinical Platform",
  description: "Next-generation healthcare workflow orchestration and event-driven care triage.",
  icons: {
    icon: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🏥</text></svg>',
  },
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
