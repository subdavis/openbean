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
      // Not emitted by the build, so name them or they miss the precache manifest.
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        // The splash iOS and Android paint before the first frame. Matching --color-bg
        // is what keeps launch from flashing a different shade than the app itself.
        background_color: "#ffffff",
        display: "standalone",
        icons: [
          { sizes: "any", src: "/icon.svg", type: "image/svg+xml" },
          // iOS and older Android launchers only take raster icons.
          { sizes: "192x192", src: "/icon-192.png", type: "image/png" },
          { sizes: "512x512", src: "/icon-512.png", type: "image/png" },
          // Full-bleed art inside the 80% safe zone, for launchers that apply their
          // own mask — without one Android boxes the rounded icon inside a circle.
          {
            purpose: "maskable",
            sizes: "512x512",
            src: "/icon-maskable-512.png",
            type: "image/png",
          },
        ],
        id: "/",
        name: "Open Album",
        scope: "/",
        short_name: "Album",
        start_url: "/posts",
        theme_color: "#ffffff",
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
