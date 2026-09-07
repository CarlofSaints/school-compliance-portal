import { isProvisioningConfigured } from "@/lib/vercelApi";
import StartForm from "@/components/StartForm";

// ---------------------------------------------------------------------------
// The signup page.
//
// 🔴 A SERVER component that checks whether this deployment can create schools
// at all, wrapping the client form.
//
// One repo builds three projects: the multi-tenant app, and HVPS and Jeppe,
// which are single-school deployments with no provisioning credentials. Without
// this check, both live school portals would carry a page offering to set up a
// new school, and pressing the button would return a 503. Never offer a control
// that cannot work; say plainly that it does not belong here.
// ---------------------------------------------------------------------------

export default function StartPage() {
  if (!isProvisioningConfigured()) {
    return (
      <main className="mx-auto max-w-xl px-6 py-24 text-center">
        <h1 className="text-xl font-bold text-dark">Not available here</h1>
        <p className="mt-3 text-gray-600">
          This portal belongs to one school and cannot create others.
        </p>
        <a
          href="https://schoolcompliance.co.za"
          className="mt-8 inline-block rounded-lg border border-gray-200 px-6 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Go to School Compliance
        </a>
      </main>
    );
  }

  return <StartForm />;
}
