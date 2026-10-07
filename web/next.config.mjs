/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Native module: keep it out of the webpack bundle.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
