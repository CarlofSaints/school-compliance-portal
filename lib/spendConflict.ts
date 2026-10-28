import { NextResponse } from "next/server";
import { getT } from "./i18n/server";
import type { SpendApplication } from "./spend";
import { SpendChangeRefused, SpendEditConflict } from "./spendData";

// The 409 for a save refused because somebody else changed the same fields
// after this person opened the project (SpendEditConflict). Carries the
// record as it is now: the grid shows it, the edit page keeps what was typed
// and takes it as the new base, so a second Save on purpose goes through. In the reader's language: the page shows it as it comes.
export async function spendConflictResponse(current: SpendApplication, fields: string[] = []): Promise<NextResponse> {
  const t = await getT();
  const when = current.changedAt ? new Date(current.changedAt) : null;
  const sameDay =
    when &&
    when.toLocaleDateString("en-ZA", { timeZone: "Africa/Johannesburg" }) ===
      new Date().toLocaleDateString("en-ZA", { timeZone: "Africa/Johannesburg" });
  const time = when
    ? when.toLocaleString("en-ZA", {
        timeZone: "Africa/Johannesburg",
        hour: "2-digit",
        minute: "2-digit",
        ...(sameDay ? {} : { day: "numeric", month: "short" }),
      })
    : "";
  const who = current.changedByName || t("Someone else");
  return NextResponse.json(
    {
      error: t(
        "{who} changed this project{when} while you had it open, so your change was not saved. Check what they changed, then save again if yours should replace it.",
        { who, when: time ? ` (${time})` : "" }
      ),
      current,
      // Which fields clashed: the edit page takes ONLY these from `current`
      // as its new base, so a second Save overwrites them on purpose and
      // still leaves the other person's other changes alone.
      fields,
    },
    { status: 409 }
  );
}

// The answer for a refusal thrown inside updateSpendApplication, or null when
// the error is something else. One place for the routes' catch blocks.
export async function spendRefusalResponse(err: unknown): Promise<NextResponse | null> {
  if (err instanceof SpendEditConflict) return spendConflictResponse(err.current, err.fields);
  if (err instanceof SpendChangeRefused) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  return null;
}
