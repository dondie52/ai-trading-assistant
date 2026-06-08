/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  transpilePackages: ["@trading/shared", "@trading/types"],
  typescript: {
    ignoreBuildErrors: false
  }
};

export default nextConfig;
