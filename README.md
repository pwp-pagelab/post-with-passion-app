# Post With Passion — AI LinkedIn Content Studio

Three-stage workflow for company analysis, LinkedIn copywriting, and PWP design-system output — every page is rendered directly as SVG/PNG, ready to publish.

## Local setup

1. Install Node.js 20+ and pnpm.
2. Copy .env.example to .env.local.
3. Add your Anthropic API key to .env.local.
4. Run: pnpm install, then pnpm dev.

Never commit .env.local or API keys to GitHub.

## Deployment

Build command: pnpm install --frozen-lockfile && pnpm build
Start command: pnpm start

Deploy to a Node.js hosting service. GitHub Pages cannot run the server-side AI endpoints.
