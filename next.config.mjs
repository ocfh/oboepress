/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Allow remote images from object storage (Vercel Blob, S3, R2, etc.)
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  // Keep the embedded Postgres (WASM) out of the bundler; it is loaded at
  // runtime in the Node.js server only. Next 14 uses the experimental key.
  experimental: {
    serverComponentsExternalPackages: ["@electric-sql/pglite"],
  },
};

export default nextConfig;
