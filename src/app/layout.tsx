import type { Metadata } from "next";
import localFont from "next/font/local";
import { Suspense } from "react";
import {
  IBM_Plex_Sans,
  JetBrains_Mono,
  Source_Serif_4,
} from "next/font/google";
import { Analytics } from "@/components/analytics";
import { MathHydrator } from "@/components/markdown/math-hydrator";
import "./globals.css";

const uiFont = IBM_Plex_Sans({
  variable: "--font-ui-default",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

const codeFont = JetBrains_Mono({
  variable: "--font-code",
  subsets: ["latin"],
  weight: ["400", "600"],
});

const latoFont = localFont({
  src: [
    {
      path: "../../fonts/Lato/Lato-Regular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../fonts/Lato/Lato-Bold.ttf",
      weight: "700",
      style: "normal",
    },
    {
      path: "../../fonts/Lato/Lato-Italic.ttf",
      weight: "400",
      style: "italic",
    },
  ],
  variable: "--font-lato",
  display: "swap",
});

const archivoNarrowFont = localFont({
  src: [
    {
      path: "../../fonts/Archivo_Narrow/ArchivoNarrow-VariableFont_wght.ttf",
      weight: "400 700",
      style: "normal",
    },
    {
      path: "../../fonts/Archivo_Narrow/ArchivoNarrow-Italic-VariableFont_wght.ttf",
      weight: "400 700",
      style: "italic",
    },
  ],
  variable: "--font-archivo-narrow",
  display: "swap",
});

const oswaldFont = localFont({
  src: [
    {
      path: "../../fonts/Oswald/Oswald-VariableFont_wght.ttf",
      weight: "200 700",
      style: "normal",
    },
  ],
  variable: "--font-oswald",
  display: "swap",
});

const robotoCondensedFont = localFont({
  src: [
    {
      path: "../../fonts/Roboto_Condensed/RobotoCondensed-VariableFont_wght.ttf",
      weight: "100 900",
      style: "normal",
    },
    {
      path: "../../fonts/Roboto_Condensed/RobotoCondensed-Italic-VariableFont_wght.ttf",
      weight: "100 900",
      style: "italic",
    },
  ],
  variable: "--font-roboto-condensed",
  display: "swap",
});

const barlowCondensedFont = localFont({
  src: [
    {
      path: "../../fonts/Barlow_Condensed/BarlowCondensed-Regular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../fonts/Barlow_Condensed/BarlowCondensed-Bold.ttf",
      weight: "700",
      style: "normal",
    },
    {
      path: "../../fonts/Barlow_Condensed/BarlowCondensed-Italic.ttf",
      weight: "400",
      style: "italic",
    },
  ],
  variable: "--font-barlow-condensed",
  display: "swap",
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
        className={[
          uiFont.variable,
          sourceSerif.variable,
          codeFont.variable,
          latoFont.variable,
          archivoNarrowFont.variable,
          oswaldFont.variable,
          robotoCondensedFont.variable,
          barlowCondensedFont.variable,
        ].join(" ")}
      >
        <Suspense fallback={null}>
          <Analytics />
        </Suspense>
        <MathHydrator />
        {children}
      </body>
    </html>
  );
}
