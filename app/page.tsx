import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { isPlatformHostname } from "@/lib/tenantContext";
import SchoolHome from "@/components/SchoolHome";

// ---------------------------------------------------------------------------
// The root, which means two different things depending on who is asking.
//
// 🔴 On the PLATFORM hostname this is Carl's portal, not a school's. Before
// this, admin.schoolcompliance.co.za showed a school sign-in loading screen,
// because the root was a client component that only ever knew how to send
// somebody to /login or /dashboard. His own front door pointed at a school
// portal that does not exist on that hostname.
//
// A server component, because deciding this needs the request's hostname and
// reading headers is also what marks the page dynamic. A client redirect would
// flash the school's loading screen first.
// ---------------------------------------------------------------------------

export default async function Home() {
  const host = (await headers()).get("host") || "";
  const hostname = host.split(":")[0].trim().toLowerCase();
  if (isPlatformHostname(hostname)) {
    redirect("/platform");
  }

  return <SchoolHome />;
}
