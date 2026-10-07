import path from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the workspace root so a lockfile in a parent folder can't confuse Next.
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  // Native module: keep it out of the bundle.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
