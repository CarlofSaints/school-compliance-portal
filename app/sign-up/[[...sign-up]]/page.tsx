import { SignUp } from "@clerk/nextjs";
import { isClerkEnabled } from "@/lib/clerkConfig";
import { notFound } from "next/navigation";
import PlatformAuthShell, { clerkAppearance } from "@/components/PlatformAuthShell";

// Clerk's sign-up. Open, because Carl chose fully self-serve: "i want them to
// be able to create their school at 1am if they want."
//
// Creating a Clerk account grants NOTHING on its own. It is an identity, not
// an authorisation: the platform portal checks the email against
// PLATFORM_ADMIN_EMAILS, and a school portal checks membership of that
// school's organisation. So an open sign-up is safe here in a way it would not
// be if the account itself carried access.
//
// Wrapped in AuthShell so the page says whose it is. See that file: a password
// form carrying none of the sender's identity is the shape of a phishing page.

export const dynamic = "force-dynamic";

export default function SignUpPage() {
  if (!isClerkEnabled()) notFound();
  return (
    <PlatformAuthShell lede="Create the account you will use to administer School Compliance.">
      <SignUp appearance={clerkAppearance} />
    </PlatformAuthShell>
  );
}
