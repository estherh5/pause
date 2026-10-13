# Pause

![Pause](pause.png)

Pause is a React app for planning how to spend a day, week, or month. Activities
are displayed in editable tables and Chart.js visualizations, with optional
shareable links, and optional Google sign-in for saved plans.

## Development

Requirements:

- Node.js 22
- npm 10 or newer

Set up and run:

```sh
npm install
cp .env.example .env.local
npx drizzle-kit push   # creates local.db
vercel dev --listen 5180
```

`vercel dev` serves the UI and the `api/` functions together; Vite alone
(`npm run dev`) serves no `api/`.

## Hosting

Vercel project `pause`, Turso database `pause`. The nightly backup runs through
`~/blob-backups`.

## Checks

```sh
npm test
npm run lint
npm run build
```

To inspect the production build locally:

```sh
npm run preview
```
