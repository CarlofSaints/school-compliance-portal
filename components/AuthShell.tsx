"use client";

import Image from "next/image";
import { useBranding } from "@/components/BrandingProvider";

// The crest / name / slogan frame shared by the signed-out pages (login,
// forgot password, reset password). Extracted when the second and third of
// those arrived rather than copying the branding markup three times — a school
// that changes its crest should not have to be found in three files.
export default function AuthShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const branding = useBranding();
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <Image
            src={branding.logo}
            alt={branding.logoAlt}
            width={100}
            height={120}
            className="mx-auto mb-4"
            priority
          />
          <h1 className="text-2xl font-bold text-dark">{branding.fullName}</h1>
          <p className="text-gray-500 mt-1">{branding.tagline}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
          <h2 className="text-xl font-semibold text-dark mb-6">{title}</h2>
          {children}
        </div>

        {branding.slogan && (
          <p className="text-center text-xs text-gray-400 mt-6">
            &quot;{branding.slogan}&quot;
            {branding.sloganSuffix ? ` — ${branding.sloganSuffix}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}
