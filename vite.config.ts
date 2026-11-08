import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error plain mjs module
import { handleApi, loadEnv } from "./server/api.mjs";

loadEnv();

const api: Plugin = {
  name: "royal-api",
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => ((await handleApi(req, res)) ? undefined : next()));
  },
  configurePreviewServer(server) {
    server.middlewares.use(async (req, res, next) => ((await handleApi(req, res)) ? undefined : next()));
  },
};

export default defineConfig({
  plugins: [react(), api],
  server: { port: 5199 },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 2500,
    // Split vendor code so the (rarely changing) engine is cached separately from game code.
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            { name: "three", test: /node_modules[\\/](three|three-stdlib|@react-three)[\\/]/, priority: 30 },
            { name: "postfx", test: /node_modules[\\/](postprocessing|n8ao)[\\/]/, priority: 25 },
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler|zustand)[\\/]/, priority: 20 },
          ],
        },
      },
    },
  },
});
