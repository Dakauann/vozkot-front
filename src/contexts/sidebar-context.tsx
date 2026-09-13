"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

/**
 * Spine width, in pixels.
 *
 * DashboardMainContent's marginLeft MUST equal the spine's rendered width. Any
 * larger value leaves a strip of panel between the spine's right rule and the
 * content, invisible on padded pages and obvious on full-bleed views. Both
 * sides read these constants so they cannot drift apart.
 */
export const SPINE_WIDTH_OPEN = 208;
export const SPINE_WIDTH_RAIL = 52;

// No HEADER_HEIGHT constant here on purpose. The bar is sized in rem (h-12), so
// it follows the root font scale. A px constant asserting one value would be a
// lie at some viewport, and this file's whole point is that a constant and the
// thing it describes cannot drift.

const STORAGE_KEY = "sidebar-collapsed";
const DESKTOP_QUERY = "(min-width: 768px)";

/**
 * The collapse preference, as an external store rather than state.
 *
 * localStorage IS the source of truth here, so it is subscribed to and read
 * during render instead of being copied into state by a mount effect. The
 * effect version rendered twice on every load, open and then the stored value,
 * and is what the compiler's set-state-in-effect rule points at.
 *
 * Subscribing to `storage` is a free consequence: collapse the spine in one tab
 * and every other tab follows, instead of each holding its own stale copy.
 */
const collapsedStore = {
  listeners: new Set<() => void>(),
  subscribe(listener: () => void) {
    collapsedStore.listeners.add(listener);
    window.addEventListener("storage", listener);
    return () => {
      collapsedStore.listeners.delete(listener);
      window.removeEventListener("storage", listener);
    };
  },
  getSnapshot() {
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      // Private mode or blocked storage: open is a fine fallback.
      return false;
    }
  },
  // Open on the server. The spine is labelled furniture an operator reads all
  // day; it starts legible and collapses only if they ask for the width back.
  getServerSnapshot() {
    return false;
  },
  set(next: boolean) {
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // Ignore localStorage errors; the in-memory notify below still runs.
    }
    collapsedStore.listeners.forEach((listener) => listener());
  },
};

/** Whether the viewport is at or above the md breakpoint, read the same way. */
function useIsDesktop() {
  const subscribe = React.useCallback((listener: () => void) => {
    const mql = window.matchMedia(DESKTOP_QUERY);
    mql.addEventListener("change", listener);
    return () => mql.removeEventListener("change", listener);
  }, []);

  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
}

interface SidebarContextType {
  /** True when the spine is reduced to its icon rail. */
  isCollapsed: boolean;
  toggleCollapsed: () => void;
  /**
   * The mobile drawer. State lives here rather than inside the sidebar because
   * the control that opens it, the app bar's hamburger, renders in a different
   * component than the drawer itself.
   */
  isMobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

const SidebarContext = React.createContext<SidebarContextType>({
  isCollapsed: false,
  toggleCollapsed: () => {},
  isMobileOpen: false,
  setMobileOpen: () => {},
});

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const isCollapsed = React.useSyncExternalStore(
    collapsedStore.subscribe,
    collapsedStore.getSnapshot,
    collapsedStore.getServerSnapshot,
  );
  const [isMobileOpen, setMobileOpen] = React.useState(false);

  const toggleCollapsed = React.useCallback(() => {
    collapsedStore.set(!collapsedStore.getSnapshot());
  }, []);

  const value = React.useMemo(
    () => ({ isCollapsed, toggleCollapsed, isMobileOpen, setMobileOpen }),
    [isCollapsed, toggleCollapsed, isMobileOpen],
  );

  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  );
}

export function useSidebar() {
  return React.useContext(SidebarContext);
}

export function DashboardMainContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { isCollapsed } = useSidebar();
  const isDesktop = useIsDesktop();

  return (
    <motion.main
      animate={{
        marginLeft: isDesktop
          ? isCollapsed
            ? SPINE_WIDTH_RAIL
            : SPINE_WIDTH_OPEN
          : 0,
      }}
      transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
      className={cn("min-h-screen", className)}
    >
      {children}
    </motion.main>
  );
}
