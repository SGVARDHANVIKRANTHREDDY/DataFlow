/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone", // FAANG FIX: Enables lean Docker optimized builds
  images: {
    domains: ["localhost"],
  },
  experimental: {
    // FAANG FIX: Ensures smaller production bundles
    optimizePackageImports: ["lucide-react", "date-fns"],
  }
};

module.exports = nextConfig;
