import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/platformAdmin";
import { platformOverview } from "@/lib/platformStats";

// Every school and its size. Behind the platform admin gate, which fails
// closed and answers 404 rather than 403 so the route's existence is not
// confirmed to anyone who should not be here.
export async function GET() {
  const admin = await requirePlatformAdmin();
  if (admin instanceof NextResponse) return admin;

  try {
    return NextResponse.json(await platformOverview());
  } catch (err) {
    console.error("[platform] Overview failed:", err);
    return NextResponse.json(
      { error: "Could not load the schools." },
      { status: 500 }
    );
  }
}
