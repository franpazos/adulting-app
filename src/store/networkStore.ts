import { create } from "zustand";

interface NetworkState {
  /** Live online/offline status from `navigator.onLine` + window events. */
  online: boolean;
  /** Set once the service worker has cached the app shell. */
  offlineReady: boolean;
  /** True when a new SW version is waiting and a refresh is needed. */
  needRefresh: boolean;
  /** Trigger to apply the waiting SW update. Wired by `registerSW`. */
  applyUpdate: (() => Promise<void>) | null;
  setOnline: (online: boolean) => void;
  setOfflineReady: (ready: boolean) => void;
  setNeedRefresh: (
    need: boolean,
    apply?: (() => Promise<void>) | null,
  ) => void;
  dismissUpdate: () => void;
}

const initialOnline =
  typeof navigator === "undefined" ? true : navigator.onLine;

export const useNetworkStore = create<NetworkState>((set) => ({
  online: initialOnline,
  offlineReady: false,
  needRefresh: false,
  applyUpdate: null,
  setOnline: (online) => set({ online }),
  setOfflineReady: (ready) => set({ offlineReady: ready }),
  setNeedRefresh: (need, apply = null) =>
    set({ needRefresh: need, applyUpdate: apply }),
  dismissUpdate: () => set({ needRefresh: false, applyUpdate: null }),
}));

/** Subscribe to navigator's online/offline events once at app boot. */
export function startNetworkWatcher(): () => void {
  if (typeof window === "undefined") return () => {};
  const set = useNetworkStore.getState().setOnline;
  const onOnline = () => set(true);
  const onOffline = () => set(false);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  set(navigator.onLine);
  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
  };
}
