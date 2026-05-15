# Deploy on Render

AI News Briefing is part of **mini-apps-dashboard** (`/briefing`). One web service is enough.

## Render path `/opt/render/project/src/package.json`

On Render, **`src` is the checkout root** (your repo root), not a folder named `src` in the repo. So **`package.json` must be at the repository root** (next to `mini-apps-dashboard/`). That root file runs install/build/start for the dashboard.

## Error: missing `package.json` at deploy root

The Next.js app lives in **`mini-apps-dashboard/`**; root **`package.json`** delegates `postinstall` + **`start`** there when Render only runs `yarn` + `npm run start` at repo root.

### Monorepo (repo has `mini-apps-dashboard/` at the root)

1. **Root Directory:** `mini-apps-dashboard`
2. **Build Command:** `npm ci && npm run build` (or `yarn install && yarn build`)
3. **Start Command:** `npm run start` (or `yarn start`)

Or connect the repo using the root **`render.yaml`** (Blueprint) and sync the service from that file.

### Repo is only the dashboard (no `mini-apps-dashboard` folder)

1. **Root Directory:** leave **empty** (repository root), **not** `src`
2. **Build Command:** `npm ci && npm run build`
3. **Start Command:** `npm run start`

Commit **`package-lock.json`** (or `yarn.lock`) so installs are reproducible on Render.
