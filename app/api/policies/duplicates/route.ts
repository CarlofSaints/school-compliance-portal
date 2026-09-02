import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { requirePermission } from "@/lib/rolesData";
import {
  getPolicies,
  getPolicyVersions,
  downloadPolicyFile,
} from "@/lib/policyData";
import { extractTextFromBuffer } from "@/lib/pdfParser";

// Downloading and reading every policy in the register takes a while.
export const maxDuration = 120;

// Near-identical is worth surfacing as well as identical: the same policy saved
// twice out of Word is byte-different every time, and a copy with one paragraph
// changed is still a copy somebody has to decide about.
const NEAR_THRESHOLD = 0.85;
const SHINGLE = 5;

interface Candidate {
  id: string;
  name: string;
  category: string;
  version: number;
  ext: string;
  filename: string;
  bytes: number;
  lastCheckScore: number | null;
  lastCheckDate: string | null;
  createdAt: string;
  fileHash: string;
  textHash: string | null; // null when the text could not be read
  shingles: Set<string> | null;
}

// Compared on content only. Names are deliberately ignored: the same document
// under two names is exactly the case this exists to find.
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shingleSet(norm: string): Set<string> {
  const words = norm.split(" ").filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + SHINGLE <= words.length; i++) {
    out.add(words.slice(i, i + SHINGLE).join(" "));
  }
  // A document shorter than one shingle still needs to compare as something.
  if (out.size === 0 && words.length) out.add(words.join(" "));
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const s of small) if (large.has(s)) shared++;
  return shared / (a.size + b.size - shared);
}

// Text extraction handles docx, txt and md. It does NOT read PDFs: those go to
// Claude as a native attachment during a check and are never parsed here. A PDF
// therefore only ever matches another file byte for byte, and the response says
// so per policy rather than letting a silent gap read as "no duplicates".
function canReadText(ext: string): boolean {
  const e = ext.toLowerCase().replace(".", "");
  return e === "docx" || e === "txt" || e === "md";
}

// Which copy to suggest keeping: the one that has already been checked, so the
// score and its tagged issues are not thrown away. Failing that, the original.
function pickKeeper(group: Candidate[]): string {
  const checked = group.filter((c) => c.lastCheckScore !== null);
  const pool = checked.length > 0 ? checked : group;
  return [...pool].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )[0].id;
}

export async function GET(req: NextRequest) {
  const session = await requirePermission(req, "manage_policies");
  if (session instanceof NextResponse) return session;

  const policies = await getPolicies();
  const candidates: Candidate[] = [];
  const unreadable: { id: string; name: string; reason: string }[] = [];

  for (const policy of policies) {
    const versions = await getPolicyVersions(policy.id);
    const latest = versions[versions.length - 1];
    if (!latest) {
      unreadable.push({
        id: policy.id,
        name: policy.name,
        reason: "No file has been uploaded against this policy.",
      });
      continue;
    }

    const buffer = await downloadPolicyFile(policy.id, latest.version, latest.ext);
    if (!buffer) {
      unreadable.push({
        id: policy.id,
        name: policy.name,
        reason: "The file is recorded but could not be read from storage.",
      });
      continue;
    }

    let textHash: string | null = null;
    let shingles: Set<string> | null = null;
    if (canReadText(latest.ext)) {
      try {
        const norm = normalise(await extractTextFromBuffer(buffer, latest.ext));
        // A handful of characters is an extraction failure, not a document.
        if (norm.length >= 200) {
          textHash = createHash("sha256").update(norm).digest("hex");
          shingles = shingleSet(norm);
        }
      } catch {
        // Leave textHash null; the file still compares byte for byte.
      }
    }

    candidates.push({
      id: policy.id,
      name: policy.name,
      category: policy.category,
      version: latest.version,
      ext: latest.ext,
      filename: latest.filename,
      bytes: buffer.length,
      lastCheckScore: policy.lastCheckScore ?? null,
      lastCheckDate: policy.lastCheckDate ?? null,
      createdAt: policy.createdAt,
      fileHash: createHash("sha256").update(buffer).digest("hex"),
      textHash,
      shingles,
    });
  }

  const strip = (c: Candidate) => {
    const { shingles: _s, ...rest } = c;
    void _s;
    return rest;
  };

  // Group by identical bytes first, then by identical text. A pair caught by
  // the stronger rule is not reported again by the weaker one.
  const groups: {
    kind: "identical-file" | "identical-content" | "near-identical";
    confidence: string;
    similarity?: number;
    keepId: string;
    policies: ReturnType<typeof strip>[];
  }[] = [];
  const claimed = new Set<string>();

  const byKey = (key: (c: Candidate) => string | null) => {
    const map = new Map<string, Candidate[]>();
    for (const c of candidates) {
      if (claimed.has(c.id)) continue;
      const k = key(c);
      if (!k) continue;
      const list = map.get(k);
      if (list) list.push(c);
      else map.set(k, [c]);
    }
    return [...map.values()].filter((g) => g.length > 1);
  };

  for (const g of byKey((c) => c.fileHash)) {
    g.forEach((c) => claimed.add(c.id));
    groups.push({
      kind: "identical-file",
      confidence: "The same file, byte for byte.",
      keepId: pickKeeper(g),
      policies: g.map(strip),
    });
  }

  for (const g of byKey((c) => c.textHash)) {
    g.forEach((c) => claimed.add(c.id));
    groups.push({
      kind: "identical-content",
      confidence:
        "Different files, but the wording is identical. Usually the same document saved twice.",
      keepId: pickKeeper(g),
      policies: g.map(strip),
    });
  }

  // Whatever is left, compare for near-identical wording.
  const rest = candidates.filter((c) => !claimed.has(c.id) && c.shingles);
  for (let i = 0; i < rest.length; i++) {
    for (let j = i + 1; j < rest.length; j++) {
      if (claimed.has(rest[i].id) || claimed.has(rest[j].id)) continue;
      const sim = jaccard(rest[i].shingles!, rest[j].shingles!);
      if (sim < NEAR_THRESHOLD) continue;
      const pair = [rest[i], rest[j]];
      pair.forEach((c) => claimed.add(c.id));
      groups.push({
        kind: "near-identical",
        confidence: `${Math.round(sim * 100)}% of the wording matches. Check before deleting either.`,
        similarity: sim,
        keepId: pickKeeper(pair),
        policies: pair.map(strip),
      });
    }
  }

  // An empty result must not read as proof when part of the register could not
  // be compared on wording at all.
  const textCompared = candidates.filter((c) => c.textHash).length;
  return NextResponse.json(
    {
      groups,
      scanned: candidates.length,
      textCompared,
      byteOnly: candidates.length - textCompared,
      unreadable,
      note:
        candidates.length - textCompared > 0
          ? "Some policies could only be compared byte for byte, because their wording cannot be read on the server (PDFs). Two PDFs of the same document will not be spotted unless the files are identical."
          : null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
