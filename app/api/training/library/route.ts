import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rolesData";
import { LIBRARY, addLibraryCourse, librarySlugsAdded } from "@/lib/campusLibrary";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";

export const maxDuration = 60;

// The built-in course library and which courses this school has added.
export async function GET(req: NextRequest) {
  const session = await requirePermission(req, "manage_training");
  if (session instanceof NextResponse) return session;
  const added = await librarySlugsAdded();
  return NextResponse.json(
    LIBRARY.map((c) => ({
      slug: c.slug,
      title: c.title,
      description: c.description,
      topic: c.topic,
      icon: c.icon,
      colour: c.colour,
      lessons: c.lessons.length,
      questions: c.test.questions.length,
      added: added.has(c.slug),
    })),
    { headers: { "Cache-Control": "no-store" } }
  );
}

// { slug } adds one course; { all: true } adds every course not yet added.
export async function POST(req: NextRequest) {
  const session = await requirePermission(req, "manage_training");
  if (session instanceof NextResponse) return session;
  const body = await req.json().catch(() => ({}));
  const wanted = body.all === true ? LIBRARY : LIBRARY.filter((c) => c.slug === body.slug);
  if (wanted.length === 0) return NextResponse.json({ error: "No such course." }, { status: 404 });

  const added: string[] = [];
  for (const course of wanted) {
    const result = await addLibraryCourse(course, session.id);
    if (result === "already_added") continue;
    added.push(course.title);
  }
  if (added.length) {
    await recordActivity({
      ...actorFrom(req, session),
      action: "training.library.added",
      entity: "training",
      summary: `Added ${added.length} Campus course${added.length === 1 ? "" : "s"} from the library: ${added.join(", ")}`,
    });
  }
  return NextResponse.json({ added: added.length });
}
