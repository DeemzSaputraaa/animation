import { defineConfig } from "vite";
import { createTtsMiddleware } from "./server/tts.js";

export default defineConfig({
  plugins: [{
    name: "indonesian-male-voice",
    configureServer(server) { server.middlewares.use(createTtsMiddleware()); },
    configurePreviewServer(server) { server.middlewares.use(createTtsMiddleware()); },
  }],
});
