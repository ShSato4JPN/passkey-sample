import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 本番では Strict Mode を有効にしておく（潜在的な不具合を早期に検知）
  reactStrictMode: true,
};

export default nextConfig;
