import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { resolveBranding } from "@/lib/brandingData";
import { headers } from "next/headers";
import { unknownHostname } from "@/lib/tenantContext";
import NoSchoolHere from "@/components/NoSchoolHere";
import { readableTextOn } from "@/lib/brandingColors";
import { BrandingProvider } from "@/components/BrandingProvider";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Resolved per request, not at build time, so a school that changes its name in
// the portal sees it in the browser tab without a redeploy.
export async function generateMetadata(): Promise<Metadata> {
  const branding = await resolveBranding();
  return {
    title: `${branding.shortName} ${branding.portalSubtitle}`,
    description: `${branding.fullName} ${branding.tagline}`,
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const branding = await resolveBranding();

  // 🔴 A wildcard means an INFINITE set of hostnames resolves here. Without
  // this, every one of them renders a working looking sign-in page under the
  // generic branding, and somebody who mistypes their school address concludes
  // the product is broken rather than that they got the address wrong.
  //
  // Checked in the layout so it catches every route at once. Only ever true on
  // a multi-tenant deployment; the two single-school projects never reach it.
  //
  // /platform is the exception: it is Carl's own cross-school portal and
  // belongs to NO school, so it is reached on a hostname the registry will
  // never know. Without this exclusion his own admin portal would show him
  // "no school at this address".
  const pathname = (await headers()).get("x-pathname") || "";
  const isPlatform = pathname.startsWith("/platform");
  const strayHost = isPlatform ? null : await unknownHostname();

  // Per-school palette, applied as inline custom properties on <html>. Inline
  // style precedence beats the stylesheet, so this recolours every
  // `bg-primary`, `text-primary`, `bg-dark` etc. without touching globals.css.
  //
  // --color-on-primary is derived rather than stored: it is whichever of white
  // or near-black is actually READABLE on the school's main colour. Without it
  // a school with a yellow or pale-blue brand gets white-on-yellow buttons.
  const themeVars = {
    "--color-primary": branding.colors.primary,
    "--color-primary-dark": branding.colors.primaryDark,
    "--color-accent": branding.colors.accent,
    "--color-dark": branding.colors.dark,
    "--color-on-primary": readableTextOn(branding.colors.primary),
  } as React.CSSProperties;

  return (
    <html lang="en" className={`${inter.variable} h-full`} style={themeVars}>
      <body className="min-h-full font-sans antialiased">
        <BrandingProvider value={branding}>
          {strayHost ? <NoSchoolHere hostname={strayHost} /> : children}
        </BrandingProvider>
      </body>
    </html>
  );
}
