import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(
  readFileSync(path.resolve(__dirname, "./package.json"), "utf-8"),
) as { version: string };

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // sqlite-wasm requires COOP/COEP for OPFS-backed persistence.
  // `same-origin-allow-popups` (vs strict `same-origin`) lets Google's OAuth
  // popup retain access to window.opener, which is needed by the Google
  // Identity Services token client.
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  optimizeDeps: {
    exclude: ["@sqlite.org/sqlite-wasm"],
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      injectRegister: false, // we register manually in lib/pwa/registerSW.ts
      includeAssets: ["favicon.svg", "icons/*"],
      // Allow testing the SW + offline behavior in `pnpm dev`.
      devOptions: {
        enabled: true,
        type: "module",
        navigateFallback: "index.html",
        suppressWarnings: true,
      },
      manifest: {
        name: "Adulting.app",
        short_name: "Adulting",
        description:
          "Local-first personal & shared finance for Fran and Sam.",
        theme_color: "#7B5CF6",
        background_color: "#FAF8F4",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        lang: "en",
        categories: ["finance", "productivity"],
        icons: [
          {
            src: "/icons/icon-192.svg",
            sizes: "192x192",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "/icons/icon-512.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            // Same SVG, separate entry for Android maskable shape.
            src: "/icons/icon-512.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Cache the app shell + the sqlite-wasm bundle so the app boots
        // entirely offline. The wasm file is fetched at runtime so it
        // needs an explicit runtimeCaching rule on top of precaching.
        globPatterns: ["**/*.{js,css,html,svg,woff2,wasm}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/_/, /\/[^/?]+\.[^/]+$/],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === "font",
            handler: "CacheFirst",
            options: {
              cacheName: "fonts",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /\.wasm$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "wasm",
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: "happy-dom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
  },
});
