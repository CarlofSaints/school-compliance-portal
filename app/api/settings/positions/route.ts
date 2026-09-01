import { NextRequest, NextResponse } from "next/server";
import { requireLogin, requirePermission } from "@/lib/rolesData";
import {
  getPositions,
  savePositions,
  getPositionUsage,
  usageFor,
  renamePositionOnPeople,
  blockedBecause,
} from "@/lib/positionsData";

export const dynamic = "force-dynamic";

// Readable by anyone signed in: the People directory orders by this list and
// the add/edit form offers it.
export async function GET(req: NextRequest) {
  const session = await requireLogin(req);
  if (session instanceof NextResponse) return session;

  const positions = await getPositions();

  // Usage is only needed by the admin screen, and costs a read of the register
  // and every application, so it is asked for rather than always computed.
  if (req.nextUrl.searchParams.get("usage") === "1") {
    const canManage = session.permissions.includes("manage_people");
    if (!canManage) {
      return NextResponse.json({ error: "Not permitted" }, { status: 403 });
    }
    const usage = await getPositionUsage();
    return NextResponse.json(
      {
        positions,
        usage: Object.fromEntries(
          positions.map((p) => [p, usageFor(usage, p)])
        ),
        // Positions that are on somebody's record or in an approval but have
        // fallen out of the list. Shown so they can be put back rather than
        // quietly disappearing from the register.
        orphans: Object.entries(usage)
          .filter(
            ([name]) =>
              !positions.some(
                (p) => p.trim().toLowerCase() === name.trim().toLowerCase()
              )
          )
          .map(([name, value]) => ({ name, ...value })),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(positions, {
    headers: { "Cache-Control": "no-store" },
  });
}

// Add a position.
export async function POST(req: NextRequest) {
  const session = await requirePermission(req, "manage_people");
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "A name is required." }, { status: 400 });
  }

  const positions = await getPositions();
  if (positions.some((p) => p.toLowerCase() === name.toLowerCase())) {
    return NextResponse.json(
      { error: `"${name}" is already on the list.` },
      { status: 409 }
    );
  }

  const saved = await savePositions([...positions, name]);
  return NextResponse.json(
    { positions: saved },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// Rename a position, or reorder the whole list.
export async function PATCH(req: NextRequest) {
  const session = await requirePermission(req, "manage_people");
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => ({}));

  // Reorder: the list is the order the directory reads in, so moving a position
  // up or down is an edit in its own right and touches nothing else.
  if (Array.isArray(body?.order)) {
    const positions = await getPositions();
    const same =
      body.order.length === positions.length &&
      body.order.every((n: unknown) =>
        positions.some(
          (p) => p.toLowerCase() === String(n).trim().toLowerCase()
        )
      );
    if (!same) {
      return NextResponse.json(
        { error: "The reordered list must contain exactly the same positions." },
        { status: 400 }
      );
    }
    const saved = await savePositions(body.order);
    return NextResponse.json(
      { positions: saved },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const from = typeof body?.from === "string" ? body.from.trim() : "";
  const to = typeof body?.to === "string" ? body.to.trim() : "";
  if (!from || !to) {
    return NextResponse.json(
      { error: "Both the current and the new name are required." },
      { status: 400 }
    );
  }

  const positions = await getPositions();
  const idx = positions.findIndex(
    (p) => p.toLowerCase() === from.toLowerCase()
  );
  if (idx === -1) {
    return NextResponse.json(
      { error: `"${from}" is not on the list.` },
      { status: 404 }
    );
  }
  if (
    positions.some(
      (p, i) => i !== idx && p.toLowerCase() === to.toLowerCase()
    )
  ) {
    return NextResponse.json(
      { error: `"${to}" is already on the list.` },
      { status: 409 }
    );
  }

  const usage = await getPositionUsage();
  const blocked = blockedBecause(usageFor(usage, from), "rename");
  if (blocked) {
    return NextResponse.json({ error: blocked }, { status: 409 });
  }

  const next = [...positions];
  next[idx] = to;
  const saved = await savePositions(next);
  // Everyone holding it moves across, so nobody is left on a position that is
  // no longer a position.
  const moved = await renamePositionOnPeople(from, to);

  return NextResponse.json(
    { positions: saved, moved },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// Remove a position.
export async function DELETE(req: NextRequest) {
  const session = await requirePermission(req, "manage_people");
  if (session instanceof NextResponse) return session;

  const name = (req.nextUrl.searchParams.get("name") || "").trim();
  if (!name) {
    return NextResponse.json({ error: "A name is required." }, { status: 400 });
  }

  const positions = await getPositions();
  if (!positions.some((p) => p.toLowerCase() === name.toLowerCase())) {
    return NextResponse.json(
      { error: `"${name}" is not on the list.` },
      { status: 404 }
    );
  }
  if (positions.length === 1) {
    return NextResponse.json(
      { error: "There has to be at least one position." },
      { status: 409 }
    );
  }

  const usage = await getPositionUsage();
  const blocked = blockedBecause(usageFor(usage, name), "remove");
  if (blocked) {
    return NextResponse.json({ error: blocked }, { status: 409 });
  }

  const saved = await savePositions(
    positions.filter((p) => p.toLowerCase() !== name.toLowerCase())
  );
  return NextResponse.json(
    { positions: saved },
    { headers: { "Cache-Control": "no-store" } }
  );
}
