import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Allow ngrok domain for WebView development
  allowedDevOrigins: ["procedure-presuming-flyaway.ngrok-free.dev"],
  // Two lockfiles exist in this tree (yarn.lock + package-lock.json), which
  // makes Turbopack infer the wrong workspace root. Pin it to this project.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
