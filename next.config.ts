import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Type checking runs explicitly in the build script. Skipping Next's duplicate
  // worker avoids Windows EPERM errors when it attempts to spawn that worker.
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    // Use threads instead of child processes for Next's page-data workers.
    workerThreads: true,
  },
};

export default nextConfig;
