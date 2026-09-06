import { SignUp } from "@clerk/nextjs";
import { isClerkEnabled } from "@/lib/clerkConfig";
import { notFound } from "next/navigation";

// Clerk's sign-up. Open, because Carl chose fully self-serve: "i want them to
// be able to create their school at 1am if they want."
//
// Creating a Clerk account grants NOTHING on its own. It is an identity, not
// an authorisation: the platform portal checks the email against
// PLATFORM_ADMIN_EMAILS, and a school portal checks membership of that
// school's organisation. So an open sign-up is safe here in a way it would not
// be if the account itself carried access.

export const dynamic = "force-dynamic";

export default function SignUpPage() {
  if (!isClerkEnabled()) notFound();
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <SignUp />
    </div>
  );
}
