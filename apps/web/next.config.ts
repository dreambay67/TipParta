import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  experimental: {
    cpus: 1
  },
  transpilePackages: ["@tipparta/shared"]
};

export default nextConfig;
