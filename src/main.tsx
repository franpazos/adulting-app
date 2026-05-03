import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";

import "./index.css";
import "@/lib/i18n";
import { router } from "@/app/router";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";
import { AppBoot } from "@/app/AppBoot";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <AppBoot>
        <RouterProvider router={router} />
      </AppBoot>
    </ThemeProvider>
  </StrictMode>,
);
