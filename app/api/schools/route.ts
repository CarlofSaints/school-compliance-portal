import { NextRequest, NextResponse } from "next/server";
import {
  provisionSchool,
  validateNewSchool,
  type NewSchoolRequest,
} from "@/lib/provisioning";
import { checkTenantKey } from "@/lib/tenant";
import { isTenantKeyAvailable } from "@/lib/tenantRegistry";

// ---------------------------------------------------------------------------
// Creating a school, from the signup form.
//
// 🔴 DELIBERATELY UNAUTHENTICATED. Carl: "i want them to be able to create
// their school at 1am if they want. i dont see why i need to be involved."
// There is no approval step and no account to have first, because the whole
// point is that nobody has to be awake.
//
// What stands in for authentication is inside provisionSchool: three schools
// per email address per hour, a hard ceiling on the number of Blob stores, an
// atomic claim on the name, and a full unwind if any step fails. Those protect
// the thing actually worth protecting, which is the ability to onboard a paying
// school tomorrow morning.
// ---------------------------------------------------------------------------

/** The hostname a school will answer on, derived from its key. */
function hostnameFor(key: string): string {
  // The wildcard is what makes this work with no DNS change per school.
  const base = process.env.SCHOOL_HOSTNAME_SUFFIX || "schoolcompliance.co.za";
  return `${key}.${base}`;
}

/**
 * Checks a proposed address without creating anything, so the form can say
 * "taken" as somebody types.
 *
 * Uses the SAME rules the real create uses rather than a second copy that
 * drifts, which is why validateNewSchool was split out.
 */
export async function GET(req: NextRequest) {
  const key = (req.nextUrl.searchParams.get("key") || "").trim().toLowerCase();
  if (!key) {
    return NextResponse.json({ error: "Give an address to check" }, { status: 400 });
  }

  const problem = checkTenantKey(key);
  if (problem === "invalid") {
    return NextResponse.json({
      available: false,
      suffix: hostnameFor(""),
      reason:
        "Use 3 to 32 lowercase letters, numbers and hyphens, not starting or ending with a hyphen.",
    });
  }
  // 🔴 A reserved address and a taken one give the SAME answer. Telling them
  // apart would turn this endpoint into a way to enumerate every school on the
  // platform, one guess at a time.
  const free = problem !== "reserved" && (await isTenantKeyAvailable(key));

  return NextResponse.json(
    {
      available: free,
      hostname: hostnameFor(key),
      // 🔴 Reported, never assumed by the form. The signup page prints the
      // domain next to the box so nobody types a street address into it, and
      // a hardcoded copy there would start lying the day this changes.
      suffix: hostnameFor(""),
      reason: free ? undefined : "That address is not available.",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: NextRequest) {
  let body: Partial<NewSchoolRequest>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Could not read that request" }, { status: 400 });
  }

  const key = String(body.key || "").trim().toLowerCase();
  const request: NewSchoolRequest = {
    name: String(body.name || "").trim(),
    key,
    adminEmail: String(body.adminEmail || "").trim(),
    adminName: String(body.adminName || "").trim() || undefined,
    primary: body.primary ? String(body.primary) : undefined,
    accent: body.accent ? String(body.accent) : undefined,
    // 🔴 Derived here, never taken from the caller. A client-supplied hostname
    // would let somebody claim a school on an address that is not theirs, and
    // the hostname is what the whole isolation model resolves from.
    hostname: hostnameFor(key),
  };

  const result = await provisionSchool(request);

  if (!result.ok) {
    // The status says what KIND of problem it is, so the form can tell a
    // retryable one from a hopeless one rather than showing the same red box.
    const status =
      result.reason === "taken" || result.reason === "invalid"
        ? 409
        : result.reason === "rate_limited"
          ? 429
          : result.reason === "at_capacity" || result.reason === "not_configured"
            ? 503
            : 500;
    return NextResponse.json({ error: result.message, reason: result.reason }, { status });
  }

  // 🔴 Nothing about the school's CREDENTIALS comes back, not even to the
  // person who just created it. The sealed blob token is the key to that
  // school's entire data set, and a response body ends up in browser history,
  // proxy logs and screenshots.
  return NextResponse.json(
    {
      key: result.tenant.key,
      name: result.tenant.name,
      hostname: result.tenant.hostnames[0],
      url: `https://${result.tenant.hostnames[0]}`,
    },
    { status: 201 }
  );
}
