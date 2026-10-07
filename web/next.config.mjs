/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Native module: keep it out of the webpack bundle.
  experimental: { serverComponentsExternalPackages: ["better-sqlite3"] },
};

export default nextConfig;
