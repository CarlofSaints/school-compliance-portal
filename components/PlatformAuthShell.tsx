import React from "react";

// ---------------------------------------------------------------------------
// The frame around Clerk's sign-in and sign-up cards.
//
// 🔴 Carl, on seeing the bare Clerk card: "it is going to confuse users and
// they might see it as a phishing attempt. only the URL says anything about
// school compliance."
//
// That is the right instinct. A page asking for a password while carrying none
// of the sender's identity is exactly the shape of a phishing page, and this
// product spends the rest of its time teaching schools to be suspicious of
// those. Clerk's card can be themed, and is, but the strongest part of the fix
// sits OUTSIDE it: our name, our mark and a sentence of context, rendered by
// us, so the page identifies itself before the reader reaches an input.
//
// ⚠️ NOT components/AuthShell, which is the SCHOOL's signed-out frame and
// reads that school's crest and colours through useBranding(). These pages run
// on the platform hostname, where there is no school to brand with, so they
// carry the School Compliance mark instead. Two frames, deliberately.
// ---------------------------------------------------------------------------

/** The fleur-de-lis from the School Compliance mark, drawn rather than loaded,
 *  so these pages have no asset dependency and cannot render half-branded. */
function Crest({ size = 44 }: { size?: number }) {
  const stroke = "#0A0A0A";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="46" fill="none" stroke={stroke} strokeWidth="3" />
      <circle cx="50" cy="50" r="40" fill="none" stroke={stroke} strokeWidth="2" />
      <path
        d="M50 24 C44 34 44 44 50 52 C56 44 56 34 50 24 Z"
        fill="none"
        stroke={stroke}
        strokeWidth="3.4"
        strokeLinejoin="round"
      />
      <path
        d="M50 52 C42 50 34 46 33 39 C32 33 38 31 41 35 C43 38 42 45 50 52 Z"
        fill="none"
        stroke={stroke}
        strokeWidth="3.4"
        strokeLinejoin="round"
      />
      <path
        d="M50 52 C58 50 66 46 67 39 C68 33 62 31 59 35 C57 38 58 45 50 52 Z"
        fill="none"
        stroke={stroke}
        strokeWidth="3.4"
        strokeLinejoin="round"
      />
      <path d="M38 56 H62" stroke={stroke} strokeWidth="3.4" strokeLinecap="round" />
      <path d="M50 52 V72" stroke={stroke} strokeWidth="3.4" strokeLinecap="round" />
      <path
        d="M44 72 C46 68 54 68 56 72"
        fill="none"
        stroke={stroke}
        strokeWidth="3.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function PlatformAuthShell({
  children,
  lede,
}: {
  children: React.ReactNode;
  lede: string;
}) {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12 flex flex-col items-center">
      <div className="w-full max-w-md text-center mb-8">
        <div className="flex justify-center mb-4">
          <Crest />
        </div>
        <div className="text-xl font-bold tracking-tight text-black">
          School Compliance
        </div>
        {/* The strapline from the mark itself, so somebody who has seen the
            website or an email from us recognises this as the same product. */}
        <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
          Policy · Spend · Audit
        </div>
        <p className="mt-5 text-sm text-neutral-600">{lede}</p>
      </div>

      {children}

      {/* 🔴 Names the third party out loud, because "Secured by Clerk" appears
          on the card and an unexplained company name is exactly what makes a
          careful person close the tab. Explaining it turns a red flag into a
          reassurance. */}
      <p className="mt-8 max-w-md text-center text-xs text-neutral-500">
        Sign in is handled for us by Clerk, so your password is never stored by
        School Compliance. You will see their name on the form above.
      </p>
      <p className="mt-3 text-xs text-neutral-400">
        <a href="https://schoolcompliance.co.za" className="hover:underline">
          schoolcompliance.co.za
        </a>
      </p>
    </div>
  );
}

/**
 * Shared theming for Clerk's cards.
 *
 * Monochrome, matching the mark and the marketing site, neither of which has an
 * accent colour anywhere. A themed card that does not match the site it came
 * from is only slightly better than an unthemed one.
 */
export const clerkAppearance = {
  variables: {
    colorPrimary: "#0A0A0A",
    colorText: "#0A0A0A",
    colorBackground: "#FFFFFF",
    borderRadius: "0.5rem",
  },
  elements: {
    // Our masthead already says who this is, so the card's own title would be
    // the second heading in a row.
    headerTitle: { display: "none" },
    headerSubtitle: { display: "none" },
    card: { boxShadow: "0 1px 2px rgba(0,0,0,0.06)", border: "1px solid #e5e5e5" },
  },
};
