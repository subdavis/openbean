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
      // Cloudflare's edge already does SPA fallback + /api routing (see wrangler.jsonc's
      // run_worker_first). Letting the SW also own navigations via navigateFallback is
      // redundant and fragile: if its precached index.html entry is ever stale/evicted
      // (e.g. mid-deploy), the cache-bound NavigationRoute has nothing to fall back to and
      // the page fails to load with ERR_FAILED until a hard refresh bypasses the SW.
      workbox: { navigateFallback: undefined },
    }),
  ],
  server: {
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
