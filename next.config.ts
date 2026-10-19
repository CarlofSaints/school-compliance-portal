import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The built-in crests, read from disk for the Word minutes (lib/minutesDocxFile.ts).
  outputFileTracingIncludes: {
    "/api/**/*": ["./public/logo*.png"],
  },
};

export default nextConfig;
