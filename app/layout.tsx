import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { branding } from "@/lib/branding";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `${branding.shortName} ${branding.portalSubtitle}`,
  description: `${branding.fullName} ${branding.tagline}`,
};

// Per-school palette, applied as inline custom properties on <html>. Inline
// style precedence beats the stylesheet, so this recolours every `bg-primary`,
// `text-primary`, `bg-dark` etc. without touching globals.css.
const themeVars = {
  "--color-primary": branding.colors.primary,
  "--color-primary-dark": branding.colors.primaryDark,
  "--color-accent": branding.colors.accent,
  "--color-dark": branding.colors.dark,
} as React.CSSProperties;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full`} style={themeVars}>
      <body className="min-h-full font-sans antialiased">{children}</body>
    </html>
  );
}
