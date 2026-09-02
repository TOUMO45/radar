/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@scenelock/schema"],
  env: {
    SCENELOCK_API_BASE: process.env.SCENELOCK_API_BASE ?? "http://localhost:4000",
  },
};

export default nextConfig;
