// Shown when a hostname under the wildcard belongs to no school.
//
// 🔴 Without this, EVERY subdomain of schoolcompliance.co.za renders a working
// looking sign-in page with the generic branding. Somebody who mistypes their
// school's address gets a portal that appears real, tries to sign in, fails,
// and concludes the product is broken. Worse, a wildcard makes the set of such
// hostnames infinite.
//
// Says plainly that there is no school here, and sends them somewhere useful.
export default function NoSchoolHere({ hostname }: { hostname?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full text-center">
        <h1 className="text-2xl font-bold text-dark">No school at this address</h1>
        <p className="text-gray-600 mt-3">
          {hostname ? (
            <>
              Nothing is set up at <strong>{hostname}</strong> yet.
            </>
          ) : (
            <>Nothing is set up at this address yet.</>
          )}
        </p>
        <p className="text-gray-500 mt-4 text-sm">
          Check the address with whoever set up your school&apos;s portal. If you
          are looking to set one up, you can start below.
        </p>
        <a
          href="https://schoolcompliance.co.za"
          className="inline-block mt-8 bg-primary hover:bg-primary-dark text-white px-6 py-3 rounded-lg font-medium transition-colors"
        >
          Go to School Compliance
        </a>
      </div>
    </div>
  );
}
