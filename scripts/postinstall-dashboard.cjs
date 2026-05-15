/**
 * Root postinstall: `npm ci` in mini-apps-dashboard.
 * Runs `next build` on Render (RENDER=true) so Build Command `yarn` produces .next.
 * Local: skipped unless FORCE_DASHBOARD_NEXT_BUILD=1. Skip always: SKIP_DASHBOARD_NEXT_BUILD=1
 */
const { execSync } = require("node:child_process");
const path = require("node:path");

const dashboard = path.join(__dirname, "..", "mini-apps-dashboard");

execSync("npm ci", { cwd: dashboard, stdio: "inherit", env: process.env });

if (process.env.SKIP_DASHBOARD_NEXT_BUILD === "1") {
  console.log("[postinstall-dashboard] SKIP_DASHBOARD_NEXT_BUILD=1 — skipping next build");
  process.exit(0);
}

const onRender =
  process.env.RENDER === "true" || process.env.RENDER === "1";
const forceBuild = process.env.FORCE_DASHBOARD_NEXT_BUILD === "1";

if (onRender || forceBuild) {
  execSync("npm run build", { cwd: dashboard, stdio: "inherit", env: process.env });
} else {
  console.log(
    "[postinstall-dashboard] Skipping next build (local). On Render, RENDER is set and build runs. Or: npm run build"
  );
}
