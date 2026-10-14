# Roadmap

Committed doc, not scratch. Kept current by hand as work ships.
**Shipped** = live in production. **Next** = intended, not promised.
**Declined** = decided against, with the reason, so it doesn't get re-proposed.

## Shipped

- **2026-10** Optional Google sign-in (crystalprism.io ring) with invite-only saved plans: name, open, rename, delete and share plans (My plans), /stats, invitations, feedback. Hosting moved from Netlify to Vercel; share links moved from pause_api into Turso with their ids.
- **2026-10 — Fleet apps + account menu and footer.** The old table-style site menu (top-left) is gone; the fleet kit's apps menu sits at the header's trailing end, listing every live app from `crystalprism.io/apps.json` (baked fallback on failure), with no account rows since pause has no sign-in. `FleetFooter` replaces the inline copyright. Kit copied byte-identical into `src/components` + `src/lib`; tokens in `src/index.css`.
- 2026-10 Flare reports now carry a wrapped error's `params` and its `cause` chain (`errorDetail` in `src/lib/flare.js`, ported from the Next template), with the template's six cases in `src/lib/flare.test.js`.
- 2026-10 Dev-dependency majors: vitest 5, jsdom 30, @testing-library/jest-dom 7, globals 17 (Dependabot #66, #69, #70, #65). No config or code changes needed.
- **2026-10** [security] Dependabot on: alerts enabled, `.github/dependabot.yml` (weekly npm, minor+patch grouped, 3-day cooldown), `npm audit fix` cleared 28 of 28 alerts; nothing left.
- 2026-10 Copy pass: tighter wording, no em-dashes (fleet copy standard).

## Next

- [from 2026-10-14] **Finish the Vercel cutover.** The first production deploy of Vercel project `pause` was refused by Vercel's Hobby daily deploy cap on 2026-10-13 (resets about 12:30 EDT). Turso DB `pause`, its backup, the 11 production env vars, the Google redirect URIs and the 4 legacy shares are already in place. Left: deploy and run the Task 20 Step 5 checks (plausible tag, `/stats` 200, `/api/me` signed-out, anonymous share round-trip, `/api/plans` 401, source map 200); compare every legacy share against `pause-api.crystalprism.io`; point `pause.crystalprism.io` at Vercel (Namecheap CNAME, needs Esther), re-copy Neon shares made during propagation with `scripts/copy-legacy-shares.mjs`, then stand Netlify down (keep the site). Full steps and rulings: `~/Developer/pause/tasks/handoff.md` if present, else the SDD ledger in the `pause-fc7abee9` worktree.
- [from 2026-10-27] **Retire pause_api.** Confirm zero requests on `pause-api.crystalprism.io` for 14 days in Vercel logs, remove its Vercel project domain, archive the repo. The Neon table is dropped only with a fresh dump and a separate approval.
- **Feedback inbound replies.** Wire replies to feedback emails back in; pick an unused one-letter prefix (`p` is passage's).
- [from 2026-10-27] **Update the skill chips on crystalprism.io and estherhoffman.com**, after "Retire pause_api" above lands. Checked 2026-10-13: `pause.crystalprism.io` is still served by Netlify and calls `pause-api.crystalprism.io`, so the chips are still true. Then edit the `<!-- Pause skills -->` block in `crystalprism.io/index.html` (now React, JavaScript, CSS, HTML5, Python, Flask, Heroku; Heroku is already stale since 2026-09) and pause's `project-skills` paragraph in `estherhoffman.com/index.html`: drop Python, Flask and Heroku, add what the Vercel stack actually uses (Vercel, Turso, Drizzle).
- [from 2026-10-17] **Upgrade eslint and @eslint/js to 10.** Held 2026-10-05: eslint-plugin-react 7.37.5 (latest) declares peer `eslint: ^3 || ... || ^9.7`, so it does not support eslint 10 (Dependabot #67, #68). Retry when eslint-plugin-react publishes a release whose peerDependencies include eslint ^10; Dependabot now ignores eslint/@eslint/js 10 (see Declined), so upgrade by hand: `npm install -D eslint@10 @eslint/js@10`.

## Declined

- 2026-10 **Dependabot #67 (eslint 10.11.0) and #68 (@eslint/js 10.0.1), closed with `@dependabot ignore this major version`.** #67's Netlify build failed at install: `npm error ERESOLVE could not resolve ... While resolving: eslint-plugin-react@7.37.5 Found: eslint@10.11.0`; eslint-plugin-react 7.37.5 is still latest and peers `eslint ^9.7` at most, and @eslint/js 10 needs eslint 10, so neither lands alone. Un-decline when eslint-plugin-react ships a stable release whose peerDependencies include eslint ^10 (the Next item above tracks the retry).

## Open questions

- **Should almanac read pause's saved plans as a source (pause to almanac)?** Almanac reads Turso dumps from `~/blob-backups/db/` locally, and a saved plan is a dated intention almanac could set beside what actually happened. Roughly 2h of work on almanac's side, nothing on pause's. Not approved; settle by Esther saying yes or no.
- **Should the planner keep an unsaved plan across reloads (form drafts)?** It changes anonymous behavior; settle by Esther.
