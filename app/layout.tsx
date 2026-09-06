import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { cookies } from "next/headers";
import "./globals.css";
import { AppSpeedInsights } from "@/components/monitoring/speed-insights";
import { BrowserViewport } from "@/components/chrome/browser-viewport";
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export const metadata: Metadata = {
  title: "Damgo Hub",
  description: "Collaborative platform for the Damgo Hub hackathon team.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const preference = (await cookies()).get("damgo_theme")?.value;
  const theme =
    preference === "dark" || preference === "light" ? preference : "system";
  return (
    <ClerkProvider appearance={clerkAppearance}>
      <html
        lang="en"
        data-theme={theme}
        className={`${geistSans.variable} ${geistMono.variable} ${playfairDisplay.variable} h-full antialiased`}
      >
        {/* h-full, not min-h-full — a minimum lets body grow past the
            viewport to fit tall content, which breaks AppShell's own
            h-full/overflow-y-auto containment chain further down and makes
            the whole page scroll (dragging the navbar with it) instead of
            just the content area scrolling internally. */}
        <body className="flex h-full min-w-0 flex-col">
          <BrowserViewport />
          {children}
          <AppSpeedInsights />
        </body>
      </html>
    </ClerkProvider>
  );
}
