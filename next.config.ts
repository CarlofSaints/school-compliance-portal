import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The built-in crests, read from disk for the Word minutes (lib/minutesDocxFile.ts).
  outputFileTracingIncludes: {
    "/api/minutes/**/*": ["./public/logo*.png"],
    // ...and the policy Word file, for a school moved onto the shared app.
    "/api/policies/**/*": ["./public/logo*.png"],
  },
};

export default nextConfig;
