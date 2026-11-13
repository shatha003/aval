import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@aval/core"],
  turbopack: { root: path.join(__dirname, "../..") },
};

export default config;
