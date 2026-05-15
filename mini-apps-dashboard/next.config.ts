import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const appRoot = path.dirname(fileURLToPath(import.meta.url));

/** Faster production builds on Render; enable with ENABLE_REACT_COMPILER=true. Dev defaults on unless ENABLE_REACT_COMPILER=false. */
const enableReactCompiler =
  process.env.ENABLE_REACT_COMPILER === "true" ||
  (process.env.NODE_ENV !== "production" &&
    process.env.ENABLE_REACT_COMPILER !== "false");

const nextConfig: NextConfig = {
  /** Use default `.next` output + `next start` on Render (standalone path was missing on deploy). */
  reactCompiler: enableReactCompiler,
  serverExternalPackages: ["jsdom"],
  /** Stops Turbopack from using a parent folder’s lockfile as workspace root (fixes missing @supabase/supabase-js). */
  turbopack: {
    root: appRoot,
  },
};

export default nextConfig;
