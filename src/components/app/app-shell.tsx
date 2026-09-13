"use client";

import type { ReactNode } from "react";

import {
  DashboardSidebar,
  adminNavItems,
  defaultProducts,
} from "@/components/elevated-design/dashboard/sidebar";
import {
  DashboardMainContent,
  SidebarProvider,
} from "@/contexts/sidebar-context";

import { DashboardNavbar } from "@/components/elevated-design/dashboard/dashboard-navbar";
import { BrandFooter } from "@/components/brand/brand-footer";

/**
 * The application shell.
 *
 * Topology: a full-width app bar owning the top-left corner, and a nav spine
 * starting below it that collapses to a 52px icon rail. The main content's left
 * margin animates in lockstep with the spine through DashboardMainContent,
 * which reads the same width constants the spine does, so the two cannot drift
 * and leave a strip of panel between the spine's rule and the content.
 *
 * The bar is the only place the spine is controlled from. On desktop its
 * hamburger collapses the rail; below md the same control opens the drawer.
 * That is why the collapse state lives in SidebarProvider rather than inside
 * the spine: the control and the thing it controls are different components.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="min-h-screen bg-background text-foreground">
        <DashboardNavbar />
        <DashboardSidebar products={defaultProducts} adminNavItems={adminNavItems} />
        <DashboardMainContent className="flex min-h-screen flex-col pt-12">
          {/* Full-bleed views escape this with -m-6, so the 6 must stay 6 or
              those views misalign. */}
          <div className="flex-1 p-3 sm:p-6">{children}</div>
          <BrandFooter />
        </DashboardMainContent>
      </div>
    </SidebarProvider>
  );
}
