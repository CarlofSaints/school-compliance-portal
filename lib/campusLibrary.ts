import { cleanQuestion, type Material, type Question, type Test, type TrainingModule } from "./training";
import { createItem, createItems, deleteItem, getModules, stamp } from "./trainingData";
import { LIBRARY } from "./campusLibrary/index";
import type { LibraryCourse } from "./campusLibraryTypes";

export { LIBRARY };
export type { LibraryCourse };

export const librarySlugsAdded = async () =>
  new Set((await getModules()).map((m) => m.librarySlug).filter((s): s is string => Boolean(s)));

/**
 * Copies a library course into THIS school's Campus, published: lessons, the
 * test, then the module (in order). A copy, so the school can edit its own
 * without touching anybody else's. Refuses a course the school already has.
 */
export async function addLibraryCourse(course: LibraryCourse, by: string): Promise<TrainingModule | "already_added"> {
  if ((await librarySlugsAdded()).has(course.slug)) return "already_added";
  const lessons: Material[] = course.lessons.map((l) => ({
    ...stamp(by, "library"),
    title: l.title,
    description: l.summary,
    body: l.body,
    icon: l.icon,
    kind: "text",
    status: "published",
  }));
  const test: Test = {
    ...stamp(by, "library"),
    title: course.test.title,
    description: "",
    status: "published",
    passMark: 70,
    maxAttempts: 0,
    showAnswers: true,
    questions: course.test.questions
      .map((q) => cleanQuestion({ type: "single", points: 1, ...q }))
      .filter((q): q is Question => q !== null),
  };
  await createItems("material", lessons);
  await createItem("test", test);
  try {
    return await createItem<TrainingModule>("module", {
      ...stamp(by, "library"),
      title: course.title,
      description: course.description,
      topic: course.topic,
      icon: course.icon,
      colour: course.colour,
      librarySlug: course.slug,
      status: "published",
      sequential: true,
      items: [...lessons.map((l) => ({ kind: "material" as const, id: l.id })), { kind: "test" as const, id: test.id }],
    });
  } catch (err) {
    await Promise.all([...lessons.map((l) => deleteItem("material", l.id)), deleteItem("test", test.id)]).catch(() => {});
    throw err;
  }
}
