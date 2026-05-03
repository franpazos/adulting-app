import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";

import "./index.css";
import "@/lib/i18n";
import { router } from "@/app/router";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";
import { AppBoot } from "@/app/AppBoot";
import { startNetworkWatcher } from "@/store/networkStore";
import { registerServiceWorker } from "@/lib/pwa/registerSW";

// Start the network watcher and the service worker before React mounts so
// the very first render already has accurate `online` state and the SW
// begins caching the app shell ASAP.
startNetworkWatcher();
registerServiceWorker();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <AppBoot>
        <RouterProvider router={router} />
      </AppBoot>
    </ThemeProvider>
  </StrictMode>,
);
