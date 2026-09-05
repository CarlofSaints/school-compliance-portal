// Shown when somebody reaches the platform portal without being an allowed
// platform admin.
//
// Deliberately says as little as possible. It does not confirm that a platform
// portal exists here, does not name who is allowed, and does not offer a
// sign-in link that would tell an outsider what to try next. The people who
// should be here already know how to sign in; anybody else learns nothing.
//
// Rendered rather than redirected: a redirect would send them to a SCHOOL
// sign-in page, which has nothing to do with this and, on a hostname belonging
// to no school, would show "no school at this address" instead.
export default function PlatformSignedOut() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full text-center">
        <h1 className="text-xl font-semibold text-dark">Not available</h1>
        <p className="text-gray-500 mt-3 text-sm">
          You do not have access to this page.
        </p>
      </div>
    </div>
  );
}
