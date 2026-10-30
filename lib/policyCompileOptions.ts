// The choices on the "Compile a policy" form. No imports, so the page and the server share it.

/** What a policy can be written to comply with. Proper names, not translated. */
export const COMPLY_WITH = [
  { key: "sasa", label: "South African Schools Act 84 of 1996 (SASA)" },
  { key: "bela", label: "Basic Education Laws Amendment Act 32 of 2024 (BELA)" },
  { key: "dbe", label: "National Department of Basic Education regulations and norms" },
  { key: "provincial", label: "Provincial education department guidelines" },
  { key: "popia", label: "Protection of Personal Information Act 4 of 2013 (POPIA)" },
  { key: "eea", label: "Employment of Educators Act 76 of 1998" },
  { key: "childrens", label: "Children's Act 38 of 2005" },
  { key: "ohsa", label: "Occupational Health and Safety Act 85 of 1993" },
] as const;

export const MAX_NAME = 150;
export const MAX_DESCRIPTION = 4000;
export const MAX_INSTRUCTION = 3000;
export const MAX_DRAFT = 150_000;
