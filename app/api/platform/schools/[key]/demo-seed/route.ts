import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platformAdmin";
import { getTenantByKey } from "@/lib/tenantRegistry";
import { runAsTenant } from "@/lib/tenantContext";
import { getPeople, savePeople } from "@/lib/peopleData";
import {
  getActionItems,
  createActionItems,
  deleteActionItem,
} from "@/lib/actionItemData";
import { getSpendApplications, saveSpendApplications } from "@/lib/spendData";
import { listMinutes, createMinutes, updateMinutes } from "@/lib/minutesData";
import {
  demoPeople,
  demoActions,
  demoSpend,
  demoMinutes,
} from "@/lib/demoData";

// ---------------------------------------------------------------------------
// Fills a school with fabricated data, so the standard guide can carry real
// screenshots of the product without any real school's records in them.
//
// Repeatable on purpose: the demo school is also what gets shown to a prospect
// on a call, and it wants resetting to a known state before one.
//
// 🔴 THE GUARD IS THE POINT. This writes invented people, invented spend and
// invented minutes into a school. Pointed at a live school it would drop nine
// fictional governors into a real governance register. So it refuses unless
// the school is EMPTY of the things it is about to write, and the caller has
// to name the school back.
//
// It is not "are you sure" that protects a real school here. It is that a real
// school is never empty.
// ---------------------------------------------------------------------------

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const admin = await requirePlatformAdmin();
  if (admin instanceof NextResponse) return admin;

  const { key } = await params;

  let body: { confirm?: string; reset?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // No body is no confirmation.
  }
  if (body.confirm !== key) {
    return NextResponse.json(
      { error: `Send the school's address "${key}" as confirmation.` },
      { status: 400 }
    );
  }

  const tenant = await getTenantByKey(key);
  if (!tenant) {
    return NextResponse.json({ error: "No school with that address" }, { status: 404 });
  }

  try {
    const result = await runAsTenant(key, async () => {
      const [people, actions, spend, minutes] = await Promise.all([
        getPeople(),
        getActionItems(),
        getSpendApplications(),
        listMinutes(),
      ]);

      const existing = {
        people: people.length,
        actions: actions.length,
        spend: spend.length,
        minutes: minutes.length,
      };

      // 🔴 Refuses on ANY existing content unless `reset` was asked for
      // explicitly. A school with a governance register is a school somebody
      // is using, whatever its name suggests.
      const occupied = Object.values(existing).some((n) => n > 0);
      if (occupied && !body.reset) {
        return {
          seeded: false as const,
          existing,
          message:
            "This school already has data. Send reset:true to replace it, and be certain it is the demo school.",
        };
      }

      const record = demoMinutes();
      const people2 = demoPeople();
      const spend2 = demoSpend();

      // People and spend REPLACE wholesale, so a reset gives one known state
      // rather than five copies of the same governing body.
      await savePeople(people2);
      await saveSpendApplications(spend2);

      // Actions only ever append (the register hands out references and never
      // reuses one), so a reset has to clear them first.
      for (const a of actions) await deleteActionItem(a.id);
      // Refs are assigned by the register rather than by the fixtures, because
      // they come from a counter that deliberately never goes backwards. On a
      // fresh school that gives A-001 upwards; after a reset it carries on from
      // where it was, which is correct and is why the guide's prose never
      // quotes a specific reference.
      const actions2 = await createActionItems(
        demoActions(record.id, record.title).map(({ ref: _ref, ...rest }) => rest)
      );

      // 🔴 Minutes are created ONLY if they are not already there. A signed set
      // cannot be deleted (deleteMinutes refuses, correctly - it is a record a
      // school is required to keep), so a reset must leave them alone rather
      // than throw halfway through and leave the school half seeded.
      const already = minutes.some((m) => m.id === record.id);
      if (!already) {
        const { signatories, status, signedAt, draftNumber, ...draft } = record;
        await createMinutes(draft);
        // Signed in a second step: createMinutes always starts a set of minutes
        // as a draft with nobody on it, which is right for every real caller.
        await updateMinutes(record.id, {
          signatories,
          status,
          signedAt,
          draftNumber,
        });
      }

      return {
        seeded: true as const,
        replaced: occupied,
        wrote: {
          people: people2.length,
          actions: actions2.length,
          spend: spend2.length,
          minutes: already ? 0 : 1,
        },
      };
    });

    console.warn(
      `[platform] ${admin.email} seeded demo data into "${key}"`,
      JSON.stringify(result)
    );
    return NextResponse.json(result, { status: result.seeded ? 200 : 409 });
  } catch (err) {
    console.error("[platform] Demo seed failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not seed that school." },
      { status: 500 }
    );
  }
}
