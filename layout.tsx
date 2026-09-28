import type { Metadata } from "next";
import "./globals.css";

// NOTE: this build sandbox can't reach fonts.googleapis.com, so next/font/google
// is swapped for system fonts here. Compass12's own brand typography (per the
// existing design system — Deep Navy / Golden Yellow) gets wired in during the
// Phase 2 landing-page rebuild; this is just an unblocked, working scaffold.

export const metadata: Metadata = {
  title: "Compass12 — Career Assessment Platform",
  description: "Discover the career path that fits you.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
