/**
 * Track the browser's install prompt event so a custom UI can surface it.
 * Chrome/Edge fire `beforeinstallprompt`; we capture the event, prevent the
 * default mini-infobar, and stash a callable `prompt()` for our banner.
 *
 * Safari iOS does NOT fire this event — there, "Add to Home Screen" is a
 * manual user action via the share sheet, so we fall back to an instructional
 * note when we detect iOS Safari.
 */

import { create } from "zustand";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface InstallState {
  /** Browser-fired event (Chrome/Edge); null on Safari etc. */
  event: BeforeInstallPromptEvent | null;
  /** True once the app has been installed in this session. */
  installed: boolean;
  /** Persistent dismissal — user explicitly closed the banner. */
  dismissed: boolean;
  setEvent: (e: BeforeInstallPromptEvent | null) => void;
  setInstalled: (v: boolean) => void;
  dismiss: () => void;
}

const STORAGE_KEY = "adulting.installDismissed";

const readDismissed = (): boolean => {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "1";
};

export const useInstallStore = create<InstallState>((set) => ({
  event: null,
  installed: false,
  dismissed: readDismissed(),
  setEvent: (event) => set({ event }),
  setInstalled: (installed) => set({ installed }),
  dismiss: () => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, "1");
    }
    set({ dismissed: true });
  },
}));

export function startInstallWatcher(): () => void {
  if (typeof window === "undefined") return () => {};

  const onBeforeInstall = (e: Event) => {
    e.preventDefault();
    useInstallStore.getState().setEvent(e as BeforeInstallPromptEvent);
  };
  const onInstalled = () => {
    useInstallStore.getState().setInstalled(true);
    useInstallStore.getState().setEvent(null);
  };

  window.addEventListener("beforeinstallprompt", onBeforeInstall);
  window.addEventListener("appinstalled", onInstalled);

  // Already running standalone? Treat as installed.
  if (
    window.matchMedia &&
    window.matchMedia("(display-mode: standalone)").matches
  ) {
    useInstallStore.getState().setInstalled(true);
  }

  return () => {
    window.removeEventListener("beforeinstallprompt", onBeforeInstall);
    window.removeEventListener("appinstalled", onInstalled);
  };
}

export function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) && !("MSStream" in window);
  const isWebKit = /WebKit/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua);
  return isIos && isWebKit;
}
