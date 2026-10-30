import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { LIMITS, enforce } from "@/lib/rateLimit";
import { cleanQuestion, type Material, type Question, type Test, type TrainingModule } from "@/lib/training";
import { createItem, stamp } from "@/lib/trainingData";
import { GenerateError, PROVINCES, TRAINING_TOPICS, generateModule } from "@/lib/trainingAi";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";

// A whole module (lessons + test) takes a few minutes to write.
export const maxDuration = 800;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const int = (v: unknown, min: number, max: number, dflt: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};

// Builds a module with AI and saves every piece as a DRAFT, in order: the
// lessons, then the test. Nothing reaches a learner until somebody has read it
// and pressed Publish on the module.
export async function POST(req: NextRequest) {
  const session = await requirePermission(req, "manage_training");
  if (session instanceof NextResponse) return session;
  const limited = await enforce([[LIMITS.trainingGenerateUser, session.id], [LIMITS.aiSchool, "school"]]);
  if (limited) return limited;
  const deadline = Date.now() + 760_000;

  const body = await req.json().catch(() => ({}));
  const topic = (TRAINING_TOPICS as readonly string[]).includes(body.topic) ? (body.topic as string) : "";
  const province = (PROVINCES as readonly string[]).includes(body.province) ? (body.province as string) : "Gauteng";
  const focus = str(body.focus, 500);
  if (!topic) return NextResponse.json({ error: "Choose a topic." }, { status: 400 });
  if (topic === "Other" && !focus) return NextResponse.json({ error: "Say what the module should cover." }, { status: 400 });

  try {
    const made = await generateModule(
      {
        topic: topic === "Other" ? focus : topic,
        province,
        focus: topic === "Other" ? "" : focus,
        audience: str(body.audience, 200),
        lessons: int(body.lessons, 1, 8, 3),
        questions: int(body.questions, 3, 30, 10),
        guidelineIds: Array.isArray(body.guidelineIds) ? body.guidelineIds.filter((x: unknown) => typeof x === "string").slice(0, 5) : [],
      },
      deadline
    );

    const lessons: Material[] = made.lessons.map((l) => ({
      ...stamp(session.id, "ai"),
      title: str(l.title, 200) || "Lesson",
      description: str(l.summary, 2000),
      body: str(l.body, 200_000),
      kind: "text",
      status: "draft",
    }));
    const questions = made.test.questions.map(cleanQuestion).filter((q): q is Question => q !== null);
    const test: Test = {
      ...stamp(session.id, "ai"),
      title: str(made.test.title, 200) || `${str(made.title, 180)} test`,
      description: "",
      status: "draft",
      passMark: 70,
      maxAttempts: 0,
      showAnswers: true,
      questions,
    };
    // Lessons and test first: a module saved before its pieces would point at nothing.
    for (const l of lessons) await createItem("material", l);
    await createItem("test", test);
    const mod = await createItem<TrainingModule>("module", {
      ...stamp(session.id, "ai"),
      title: str(made.title, 200) || topic,
      description: str(made.description, 2000),
      topic: topic === "Provincial education guidelines" ? `${province} guidelines` : topic === "Other" ? focus : topic,
      status: "draft",
      sequential: true,
      items: [...lessons.map((l) => ({ kind: "material" as const, id: l.id })), { kind: "test" as const, id: test.id }],
    });

    await recordActivity({
      ...actorFrom(req, session),
      action: "training.module.generated",
      entity: "training",
      entityId: mod.id,
      summary: `Built training module "${mod.title}" with AI (${lessons.length} lessons, ${questions.length} questions, draft)`,
    });
    return NextResponse.json({ id: mod.id }, { status: 201 });
  } catch (err) {
    if (err instanceof GenerateError) return NextResponse.json({ error: err.message }, { status: 422 });
    console.error("[training generate] Failed:", err);
    const timedOut = err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError" || /abort/i.test(err.message));
    return NextResponse.json(
      { error: timedOut ? "That took too long. Ask for fewer lessons or questions." : "The module could not be built. Please try again." },
      { status: timedOut ? 504 : 500 }
    );
  }
}
