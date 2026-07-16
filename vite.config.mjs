import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { createAgentsMiddleware } from "./server/agents.mjs";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const agents = createAgentsMiddleware({
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL || "gpt-5.4-mini",
    googleFontsApiKey: env.GOOGLE_FONTS_API_KEY,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    anthropicModel: env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514"
  });
  return ({
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react(), { name: "three-ai-agents", configureServer(server) { server.middlewares.use(agents); } }],
  });
});
