import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp (a native binary) feathers the embed-card avatar in app/api/card-image.
  // Marking it external loads it from node_modules at runtime instead of bundling
  // it, so the correct platform binary is used on Vercel.
  serverExternalPackages: ["sharp"],

  // Explicit root: this directory also lives nested inside the (unrelated)
  // gitfut repo during development, which has its own package-lock.json one
  // level up. Without this, Turbopack's root auto-detection walks up and
  // picks THAT lockfile as the workspace root instead of this one, which
  // silently breaks routing (every route 404s) once its cache gets primed
  // against the wrong root.
  turbopack: {
    root: path.resolve(__dirname),
  },

  async rewrites() {
    // Pretty embed URL: leetfut.com/<username>.png -> the card image route. The
    // username charset matches LeetCode's (alphanumerics + hyphens/underscores),
    // and it only matches the .png suffix, so this never shadows real static
    // assets in /public. Returned as an afterFiles rewrite (a plain array), so
    // /public files still win over it regardless.
    return [
      { source: "/:username([a-zA-Z0-9_-]+).png", destination: "/api/card-image/:username" },
    ];
  },
};

export default nextConfig;
