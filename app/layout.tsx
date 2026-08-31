import type { Metadata } from "next";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { clerkAppearance } from "@/lib/clerk-appearance";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Damgo Hub",
  description: "Collaborative platform for the Damgo Hub hackathon team.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <ClerkProvider appearance={clerkAppearance}>
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} ${playfairDisplay.variable} h-full antialiased`}
      >
        {/* h-full, not min-h-full — a minimum lets body grow past the
            viewport to fit tall content, which breaks AppShell's own
            h-full/overflow-y-auto containment chain further down and makes
            the whole page scroll (dragging the navbar with it) instead of
            just the content area scrolling internally. */}
        <body className="flex h-full flex-col">{children}</body>
      </html>
    </ClerkProvider>
  );
}
