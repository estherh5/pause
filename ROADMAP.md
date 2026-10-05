# Roadmap

Committed doc, not scratch. Kept current by hand as work ships.
**Shipped** = live in production. **Next** = intended, not promised.
**Declined** = decided against, with the reason, so it doesn't get re-proposed.

## Shipped

- 2026-10 Flare reports now carry a wrapped error's `params` and its `cause` chain (`errorDetail` in `src/lib/flare.js`, ported from the Next template), with the template's six cases in `src/lib/flare.test.js`.
- 2026-10 Dev-dependency majors: vitest 5, jsdom 30, @testing-library/jest-dom 7, globals 17 (Dependabot #66, #69, #70, #65). No config or code changes needed.
- **2026-10** [security] Dependabot on: alerts enabled, `.github/dependabot.yml` (weekly npm, minor+patch grouped, 3-day cooldown), `npm audit fix` cleared 28 of 28 alerts; nothing left.
- 2026-10 Copy pass: tighter wording, no em-dashes (fleet copy standard).

## Next

- [from 2026-10-17] **Upgrade eslint and @eslint/js to 10.** Held 2026-10-05: eslint-plugin-react 7.37.5 (latest) declares peer `eslint: ^3 || ... || ^9.7`, so it does not support eslint 10 (Dependabot #67, #68). Retry when eslint-plugin-react publishes a release whose peerDependencies include eslint ^10.

## Declined

## Open questions
