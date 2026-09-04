"use client";

import { useRef, useState, useEffect } from "react";
import {
  checkColours,
  derivePalette,
  normaliseHex,
  type ColourWarning,
} from "@/lib/brandingColors";

// ---------------------------------------------------------------------------
// The branding half of school setup: crest, main colour, second colour.
//
// A component rather than a page, because the same three fields are wanted in
// two places — when a school first signs up, and afterwards when somebody wants
// to change them. Building it twice is how they drift apart.
//
// Everything else about the palette is derived (lib/brandingColors.ts). Asking
// somebody for a "primary tint" would be asking a question they cannot answer.
// ---------------------------------------------------------------------------

export interface BrandingValue {
  /** Data URL while it is being chosen, or an existing URL when editing. */
  logoDataUrl: string | null;
  logoFilename: string | null;
  primary: string;
  accent: string;
}

// Kept modest deliberately. A crest is displayed at 100px on the login page and
// 52px in email; a 6MB photo would be carried on every page load for nothing.
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
// The picker's filter. Must stay in step with ACCEPTED, or somebody is offered
// a file the upload then refuses ([[upload-allowlist-vs-accept-attribute]]).
const ACCEPT_ATTR = ".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml";

export default function SchoolBrandingFields({
  value,
  onChange,
  schoolName,
}: {
  value: BrandingValue;
  onChange: (next: BrandingValue) => void;
  schoolName: string;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<ColourWarning[]>([]);

  useEffect(() => {
    setWarnings(checkColours(value.primary, value.accent));
  }, [value.primary, value.accent]);

  const palette = derivePalette(value.primary, value.accent);

  const pickLogo = (file: File | null) => {
    setFileError(null);
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      setFileError("That needs to be a PNG, JPG, WEBP or SVG image.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setFileError(
        `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB. Please use one under 2MB, since a crest is only ever shown small.`
      );
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setFileError("That file could not be read. Try another.");
    reader.onload = () =>
      onChange({
        ...value,
        logoDataUrl: String(reader.result),
        logoFilename: file.name,
      });
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          School crest or logo
        </label>
        <p className="text-xs text-gray-500 mb-3">
          Shown on the sign-in page, in the sidebar, on reports and at the top of
          every email the portal sends. PNG, JPG, WEBP or SVG, under 2MB.
        </p>

        <div className="flex items-center gap-4">
          <div className="w-20 h-20 shrink-0 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden">
            {value.logoDataUrl ? (
              // Deliberately a plain img, not next/image: this is a data URL
              // that changes as they pick, so there is nothing to optimise.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={value.logoDataUrl}
                alt="The crest you have chosen"
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <span className="text-xs text-gray-400 text-center px-2">No crest yet</span>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT_ATTR}
              className="hidden"
              onChange={(e) => pickLogo(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {value.logoDataUrl ? "Choose a different file" : "Browse for a file"}
            </button>
            {value.logoFilename && (
              <span className="text-xs text-gray-500">{value.logoFilename}</span>
            )}
            {value.logoDataUrl && (
              <button
                type="button"
                onClick={() => {
                  onChange({ ...value, logoDataUrl: null, logoFilename: null });
                  // Or picking the same file again fires no change event.
                  if (fileInput.current) fileInput.current.value = "";
                }}
                className="text-xs text-risk-high hover:underline self-start"
              >
                Remove
              </button>
            )}
          </div>
        </div>

        {fileError && (
          <p className="mt-2 text-sm text-risk-high">{fileError}</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ColourField
          label="Main colour"
          hint="Buttons, headings and the email header."
          value={value.primary}
          onChange={(primary) => onChange({ ...value, primary })}
        />
        <ColourField
          label="Second colour"
          hint="The school name in the sidebar, and the highlight on the page you are on."
          value={value.accent}
          onChange={(accent) => onChange({ ...value, accent })}
        />
      </div>

      {warnings.length > 0 && (
        <div className="space-y-2">
          {warnings.map((w, i) => (
            <p
              key={i}
              className={`text-sm px-3 py-2 rounded-lg ${
                w.level === "error"
                  ? "bg-red-50 text-risk-high"
                  : "bg-amber-50 text-amber-800"
              }`}
            >
              {w.message}
            </p>
          ))}
        </div>
      )}

      <BrandingPreview
        schoolName={schoolName}
        logo={value.logoDataUrl}
        palette={palette}
      />
    </div>
  );
}

function ColourField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  // The text box is kept separate from the committed value so somebody can type
  // "#00b" on the way to "#00bcd4" without the swatch lurching to a colour they
  // never meant. It only commits once what they have typed is a real colour.
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);

  const valid = normaliseHex(text) !== null;

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <p className="text-xs text-gray-500 mb-2">{hint}</p>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={normaliseHex(value) || "#475569"}
          onChange={(e) => onChange(e.target.value)}
          className="w-11 h-11 rounded-lg border border-gray-200 cursor-pointer bg-white p-1"
          aria-label={`${label} swatch`}
        />
        <input
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const hex = normaliseHex(e.target.value);
            if (hex) onChange(hex);
          }}
          onBlur={() => setText(value)}
          placeholder="#00bcd4"
          spellCheck={false}
          className={`flex-1 min-w-0 px-3 py-2.5 border rounded-lg outline-none transition font-mono text-sm ${
            valid
              ? "border-gray-200 focus:ring-2 focus:ring-primary focus:border-transparent"
              : "border-red-300 focus:ring-2 focus:ring-red-200"
          }`}
        />
      </div>
    </div>
  );
}

/** Shows the two colours doing the jobs they will actually do, because a pair
 *  of swatches tells you nothing about what the portal will look like. */
function BrandingPreview({
  schoolName,
  logo,
  palette,
}: {
  schoolName: string;
  logo: string | null;
  palette: ReturnType<typeof derivePalette>;
}) {
  const name = schoolName.trim() || "Your school";
  return (
    <div>
      <p className="block text-sm font-medium text-gray-700 mb-2">Preview</p>
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex" style={{ minHeight: 190 }}>
          {/* Sidebar — where the second colour earns its keep */}
          <div className="w-40 shrink-0 p-3" style={{ background: palette.dark }}>
            <div className="flex items-center gap-2 mb-4">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="" className="w-6 h-6 object-contain" />
              ) : (
                <div className="w-6 h-6 rounded bg-white/20" />
              )}
              <span
                className="text-xs font-semibold truncate"
                style={{ color: palette.accent }}
              >
                {name}
              </span>
            </div>
            <div
              className="text-[11px] px-2 py-1.5 rounded mb-1"
              style={{ background: `${palette.accent}26`, color: palette.accent }}
            >
              Dashboard
            </div>
            <div className="text-[11px] px-2 py-1.5 text-white/50">Policies</div>
            <div className="text-[11px] px-2 py-1.5 text-white/50">Action items</div>
          </div>

          {/* Page — where the main colour earns its keep */}
          <div className="flex-1 bg-white p-4">
            <div
              className="text-sm font-semibold mb-3"
              style={{ color: palette.primary }}
            >
              Compliance overview
            </div>
            <div className="flex gap-2 mb-4">
              <span
                className="text-xs px-3 py-1.5 rounded-lg font-medium"
                style={{ background: palette.primary, color: palette.onPrimary }}
              >
                Run a check
              </span>
              <span className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600">
                Export
              </span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden mb-2">
              <div
                className="h-full w-2/3 rounded-full"
                style={{ background: palette.primary }}
              />
            </div>
            <p className="text-[11px] text-gray-400">
              Buttons use {palette.onPrimary === "#ffffff" ? "white" : "dark"} text
              so they stay readable on your main colour.
            </p>
          </div>
        </div>

        {/* Email header, which is the one place people see the crest big */}
        <div
          className="px-4 py-3 text-center"
          style={{ background: palette.primary }}
        >
          {logo && (
            <div className="inline-block bg-white rounded p-1 mb-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo} alt="" className="w-7 h-7 object-contain block" />
            </div>
          )}
          <div className="text-xs font-semibold" style={{ color: palette.onPrimary }}>
            {name}
          </div>
          <div className="text-[10px]" style={{ color: palette.primaryTint }}>
            Compliance Portal
          </div>
        </div>
      </div>
    </div>
  );
}
