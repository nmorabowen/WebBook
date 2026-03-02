import type { Metadata } from "next";
import {
  IBM_Plex_Sans,
  JetBrains_Mono,
  Source_Serif_4,
} from "next/font/google";
import { MathHydrator } from "@/components/markdown/math-hydrator";
import "./globals.css";

const uiFont = IBM_Plex_Sans({
  variable: "--font-ui",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const readingFont = Source_Serif_4({
  variable: "--font-reading",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

const codeFont = JetBrains_Mono({
  variable: "--font-code",
  subsets: ["latin"],
  weight: ["400", "600"],
});

export const metadata: Metadata = {
  title: "WebBook",
  description:
    "Markdown-first books and notes with MathJax, publishing, and runnable Python.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${uiFont.variable} ${readingFont.variable} ${codeFont.variable}`}
      >
        <MathHydrator />
        {children}
      </body>
    </html>
  );
}
