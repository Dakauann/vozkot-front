import { BrandFooter } from "@/components/brand/brand-footer";
import { CatalogueFooterNav } from "@/components/events/catalogue-footer-nav";
import { PublicNavbar } from "@/components/brand/public-navbar";

/**
 * The chrome every buyer-facing page shares.
 *
 * A route group rather than a folder: `(public)` adds a layout without adding a
 * path segment, so the catalogue stays at `/` and an event stays at
 * `/eventos/<slug>`. The operator side has its own shell under `(app)`, and the
 * two never see each other's navigation.
 *
 * A column that fills the viewport, with the footer pushed to the bottom by the
 * growing middle, so a short page (an empty search, a sold-out event) still
 * has the footer at the bottom of the window instead of floating halfway up it.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <PublicNavbar />
      <div className="flex-1">{children}</div>
      <CatalogueFooterNav />
      <BrandFooter />
    </div>
  );
}
