import type { Metadata } from "next";
import { Geist, Geist_Mono, Public_Sans } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The mobile app ships the PublicSans-* family (FONTS in theme.tsx); the web
// app uses the same face so the two products read as one. Added alongside Geist
// rather than replacing it, so the existing WebView pages are unaffected.
const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "HelpersHob",
  description: "Helping hands, caring hearts",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${publicSans.variable} h-full antialiased`}
    >
      {/* Extensions (ColorZilla, Grammarly and friends) write attributes onto
          <body> before React hydrates, which the server HTML cannot know about.
          Suppressed one level deep only — it does not reach `children`, so real
          mismatches inside the app are still reported. */}
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
