/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  trailingSlash: true,
  // Native / optional DB drivers must not be bundled; they are imported dynamically by lib/db/index.ts.
  experimental: { serverComponentsExternalPackages: ["better-sqlite3", "postgres"] },
};
export default nextConfig;
