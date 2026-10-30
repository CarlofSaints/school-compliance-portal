// What the AI builder offers. Its own file so the browser can import it without the AI client.

export const TRAINING_TOPICS = [
  "BELA Act (Basic Education Laws Amendment Act 32 of 2024)",
  "South African Schools Act 84 of 1996 (SASA)",
  "Gauteng Department of Education (GDE) regulations and circulars",
  "Provincial education guidelines",
  "Other",
] as const;

export const PROVINCES = [
  "Eastern Cape",
  "Free State",
  "Gauteng",
  "KwaZulu-Natal",
  "Limpopo",
  "Mpumalanga",
  "North West",
  "Northern Cape",
  "Western Cape",
] as const;

/** Module card colours. Tailwind classes are written out in full so the build keeps them. */
export const MODULE_COLOURS = {
  violet: { band: "bg-violet-500", soft: "bg-violet-50", hover: "hover:bg-violet-50", text: "text-violet-700", bar: "bg-violet-500" },
  sky: { band: "bg-sky-500", soft: "bg-sky-50", hover: "hover:bg-sky-50", text: "text-sky-700", bar: "bg-sky-500" },
  emerald: { band: "bg-emerald-500", soft: "bg-emerald-50", hover: "hover:bg-emerald-50", text: "text-emerald-700", bar: "bg-emerald-500" },
  amber: { band: "bg-amber-500", soft: "bg-amber-50", hover: "hover:bg-amber-50", text: "text-amber-700", bar: "bg-amber-500" },
  rose: { band: "bg-rose-500", soft: "bg-rose-50", hover: "hover:bg-rose-50", text: "text-rose-700", bar: "bg-rose-500" },
  indigo: { band: "bg-indigo-500", soft: "bg-indigo-50", hover: "hover:bg-indigo-50", text: "text-indigo-700", bar: "bg-indigo-500" },
  teal: { band: "bg-teal-500", soft: "bg-teal-50", hover: "hover:bg-teal-50", text: "text-teal-700", bar: "bg-teal-500" },
  orange: { band: "bg-orange-500", soft: "bg-orange-50", hover: "hover:bg-orange-50", text: "text-orange-700", bar: "bg-orange-500" },
} as const;
export type ModuleColour = keyof typeof MODULE_COLOURS;
