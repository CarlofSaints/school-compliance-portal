import type { ModuleColour } from "./trainingTopics";

/** A ready-made module shipped with the portal, written once and added to any school's Campus with one click. */
export interface LibraryCourse {
  slug: string;
  title: string;
  description: string;
  topic: string;
  icon: string;
  colour: ModuleColour;
  lessons: { title: string; icon: string; summary: string; body: string }[];
  test: {
    title: string;
    questions: { text: string; options: { text: string; isCorrect: boolean }[]; explanation: string }[];
  };
}

/** Everything wrong with a library course, so the check script can refuse a bad one. */
export function libraryProblems(c: LibraryCourse): string[] {
  const out: string[] = [];
  const all = JSON.stringify(c);
  if (!/^[a-z0-9-]+$/.test(c.slug)) out.push("slug must be kebab-case");
  if (!c.title || !c.description || !c.icon) out.push("title, description and icon are required");
  if (c.lessons.length < 3 || c.lessons.length > 4) out.push(`${c.lessons.length} lessons (want 3 or 4)`);
  c.lessons.forEach((l, i) => {
    if (!l.title || !l.icon || !l.body) out.push(`lesson ${i + 1} is missing a field`);
    if (!l.body.includes("## ✅ Key points")) out.push(`lesson ${i + 1} has no Key points`);
  });
  if (c.test.questions.length !== 10) out.push(`${c.test.questions.length} questions (want 10)`);
  c.test.questions.forEach((q, i) => {
    if (q.options.length !== 4) out.push(`question ${i + 1} has ${q.options.length} options`);
    if (q.options.filter((o) => o.isCorrect).length !== 1) out.push(`question ${i + 1} needs exactly one right answer`);
    if (!q.explanation) out.push(`question ${i + 1} has no explanation`);
  });
  if (/—| – /.test(all)) out.push("contains an em or en dash");
  return out;
}
