import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@bumps/floor-model"],
};

export default nextConfig;
