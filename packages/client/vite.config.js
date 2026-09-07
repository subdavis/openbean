import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Builds straight into the backend's static dir — one deployable, per the spec.
export default defineConfig({
  build: {
    emptyOutDir: true,
    outDir: "../server/public",
  },
  plugins: [
    vue(),
    VitePWA({
      manifest: {
        background_color: "#f7f5f0",
        display: "standalone",
        icons: [{ sizes: "any", src: "/icon.svg", type: "image/svg+xml" }],
        name: "Open Album",
        short_name: "Open Album",
        start_url: "/posts",
        theme_color: "#2a2a28",
      },
      registerType: "autoUpdate",
      // The shell answers navigations, but /api belongs to the server: without this the
      // worker serves index.html for the OAuth callback and no session is ever issued.
      workbox: { navigateFallbackDenylist: [/^\/api\//] },
    }),
  ],
  server: {
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
