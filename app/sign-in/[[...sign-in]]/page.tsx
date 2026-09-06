import { SignIn } from "@clerk/nextjs";
import { isClerkEnabled } from "@/lib/clerkConfig";
import { notFound } from "next/navigation";

// Clerk's sign-in, for the shared multi-tenant app.
//
// Distinct from /login, which is the OLD per-school sign-in that HVPS and
// Jeppe still use. Both exist on purpose while Clerk goes in underneath the
// existing auth: swapping the two over on a live school is a separate,
// deliberate step, and doing it at the same time as introducing Clerk is how
// people get locked out on a Saturday.
//
// 404s on a deployment without Clerk, so the two school projects do not serve
// a sign-in page that cannot work.

export const dynamic = "force-dynamic";

export default function SignInPage() {
  if (!isClerkEnabled()) notFound();
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <SignIn />
    </div>
  );
}
