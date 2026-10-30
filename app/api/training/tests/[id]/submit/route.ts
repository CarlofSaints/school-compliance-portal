import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/rolesData";
import { attemptsAt, submitAttempt } from "@/lib/training";
import { getProgress, getTest, recordAttempt } from "@/lib/trainingData";
import { trainingGate } from "@/lib/trainingAccess";
import { recordActivity } from "@/lib/activityLog";
import { actorFrom } from "@/lib/activityActor";

// Hands in a paper: marked here, on the server, against the stored memo.
// Answers the score, and the memo too when the test is set to show it.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const test = await getTest(id);
  const blocked = await trainingGate(session, test && { kind: "test", id, status: test.status }, await getProgress(session.id));
  if (blocked || !test) return blocked!;

  const body = await req.json().catch(() => ({}));
  const responses = body && typeof body.responses === "object" && body.responses ? (body.responses as Record<string, unknown>) : {};
  let usedBefore = 0;
  const attempt = await recordAttempt(session.id, (p) => {
    usedBefore = attemptsAt(p, id).length;
    return submitAttempt(test, p, responses, new Date().toISOString());
  });
  if (attempt === "no_attempts_left") {
    return NextResponse.json({ error: "You have used all your attempts at this test." }, { status: 409 });
  }

  await recordActivity({
    ...actorFrom(req, session),
    action: "training.test.submitted",
    entity: "training",
    entityId: id,
    summary: `Sat "${test.title}": ${attempt.scorePct}% (${attempt.passed ? "passed" : "not passed"})`,
  });

  // The right answers only once they can no longer be copied into another
  // attempt: after a pass, or after the last attempt. Before that the person
  // learns WHICH questions were wrong, not what the right answer was, or every
  // test (and the leaderboard) could be won by handing in a blank paper first.
  const lastAttempt = test.maxAttempts > 0 && usedBefore + 1 >= test.maxAttempts;
  const reveal = test.showAnswers && (attempt.passed || lastAttempt);
  const memo = test.showAnswers
    ? test.questions.map((q) => {
        const mine = attempt.answers.find((a) => a.questionId === q.id);
        return {
          questionId: q.id,
          isCorrect: mine?.isCorrect ?? false,
          correctOptionIds: reveal ? q.options.filter((o) => o.isCorrect).map((o) => o.id) : [],
          acceptedAnswers: reveal ? q.acceptedAnswers : [],
          explanation: reveal ? q.explanation : "",
        };
      })
    : null;
  return NextResponse.json({
    scorePct: attempt.scorePct,
    passed: attempt.passed,
    pointsAwarded: attempt.pointsAwarded,
    pointsPossible: attempt.pointsPossible,
    passMark: test.passMark,
    answersShown: reveal,
    memo,
  });
}
