# Frontend

The SONANCE AI frontend is built with React, TypeScript, and Vite.

## Development

```bash
npm ci
npm run dev
```

## Quality checks

```bash
npm run lint
npm run build
```

The production build is written to `dist/`. The frontend uses the same-origin API in production; configure `VITE_API_BASE_URL` only when a separate API origin is required.
