/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Allow remote images from object storage (Vercel Blob, S3, R2, etc.)
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  // Keep the embedded Postgres (WASM) out of the bundler; it is loaded at
  // runtime in the Node.js server only. Next 14 uses the experimental key.
  experimental: {
    serverComponentsExternalPackages: [
      "@electric-sql/pglite",
      "drizzle-orm/pglite",
      "drizzle-orm/pglite/migrator",
    ],
  },
  // Belt-and-suspenders for `next dev`: the experimental key above is honoured
  // by the production build but dev sometimes re-bundles pglite's inlined WASM,
  // which makes it `Aborted()` at runtime. Force it external on the server.
  webpack: (config, { isServer }) => {
    if (isServer) {
      const ext = config.externals;
      const add = "@electric-sql/pglite";
      config.externals = Array.isArray(ext)
        ? [...ext, add]
        : ext
          ? [ext, add]
          : [add];
    }
    return config;
  },
};

export default nextConfig;
