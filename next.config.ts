import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow ngrok domain for WebView development
  allowedDevOrigins: ['procedure-presuming-flyaway.ngrok-free.dev'],
};

export default nextConfig;
