"use client";

import * as React from "react";

import { AnimatePresence, motion, type Variants } from "framer-motion";
import {
  CalendarBlank,
  CaretDown,
  ChartBar,
  Check,
  Gear,
  Headset,
  Plus,
  Question,
  Receipt,
  SquaresFour,
  Stack,
  Storefront,
  UserCircle,
  UserCheck,
  UsersThree,
  X,
} from "@/components/icons";
import {
  SPINE_WIDTH_OPEN,
  SPINE_WIDTH_RAIL,
  useSidebar,
} from "@/contexts/sidebar-context";

import { BrandLogo } from "@/components/brand/brand-mark";
import { Link, usePathname } from "@/i18n/routing";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { useIsomorphicLayoutEffect } from "@/hooks/use-isomorphic-layout-effect";
import { useIsOrganizer } from "@/lib/events/organizer";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import type { Icon, IconProps } from "@/components/icons";

/*
 * Either a phosphor icon or one of the brand marks.
 *
 * The union rather than a hand-written prop shape: the icons carry a closed
 * IconWeight, so a looser `weight?: string` here is not assignable to them and
 * every row in the nav arrays fails to typecheck. The brand components accept
 * IconProps and simply ignore `weight`.
 */
type NavIcon = Icon | React.ComponentType<IconProps>;

/** Which nav rows the operator left expanded. */
const OPEN_ITEMS_KEY = "dashboard-open-families";
/** Which section families the operator left open. */
const OPEN_FAMILIES_KEY = "dashboard-open-nav-families";

/**
 * A Set of open keys that survives a refresh, collapsed by default.
 *
 * Three things have to be true at once for this to feel stable, and each is a
 * separate mechanism:
 *
 * 1. NO HYDRATION MISMATCH. The initial value is an empty Set on the server AND
 *    on the client's first render, so the markup React hydrates against matches
 *    exactly. Reading localStorage in the useState initialiser would render open
 *    sections on the client against a collapsed server payload, which React
 *    reports as a hydration error and repairs by discarding the markup.
 *
 * 2. NO FLASH. The restore runs in a LAYOUT effect, which React flushes
 *    synchronously before the browser paints, so the first frame the operator
 *    sees is already the remembered shape.
 *
 * 3. NO STUTTER. Restored sections must not replay their accordion. Callers gate
 *    the transition duration on `motionEnabled`, which flips one animation frame
 *    later, i.e. after that first paint.
 */
function usePersistentOpenSet(storageKey: string, initial?: () => Set<string>) {
  // `initial` is what a first-time visitor sees. Stored state, when there is
  // any, replaces it in the layout effect below, so the operator's own choice
  // always wins over the default.
  const [open, setOpen] = React.useState<Set<string>>(() => initial?.() ?? new Set());
  const didRestore = React.useRef(false);

  useIsomorphicLayoutEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setOpen(
            new Set(parsed.filter((k): k is string => typeof k === "string")),
          );
        }
      }
    } catch {
      // Private mode, quota, or corrupt JSON: collapsed is a fine fallback.
    }
    didRestore.current = true;
  }, [storageKey]);

  React.useEffect(() => {
    // Guarded so the empty initial Set can never overwrite stored state.
    if (!didRestore.current) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(Array.from(open)));
    } catch {
      // Ignore localStorage errors
    }
  }, [open, storageKey]);

  const toggle = React.useCallback((key: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  return [open, toggle] as const;
}

/**
 * Who a row or a product is for.
 *
 * `organizer` is not a role. The backend knows `admin` and `user` only, and an
 * account becomes an organizer by owning an event, so this is resolved from
 * data by `useIsOrganizer`. Absent means everyone.
 *
 * It decides VISIBILITY IN THE SPINE, nothing else. Every organizer surface is
 * authorized in its own usecase against the actor's ownership, so this is a
 * question of what to offer, never of what to allow.
 */
export type Audience = "organizer";

export interface NavItem {
  icon: NavIcon;
  /** A key under the `nav` namespace; the row translates it at render. */
  labelKey: string;
  href: string;
  /** Hidden from anyone whose role is not admin. */
  admin?: boolean;
  /** Hidden from anyone this row is not for. Absent means everyone. */
  audience?: Audience;
  children?: NavItem[];
  /** The section this row is legended under. Rows with no family run loose. */
  family?: string;
}

export interface Product {
  id: string;
  nameKey: string;
  descriptionKey: string;
  icon: NavIcon;
  navItems: NavItem[];
  /** Hidden from anyone this context is not for. Absent means everyone. */
  audience?: Audience;
}

export interface DashboardSidebarProps {
  products: Product[];
  adminNavItems?: NavItem[];
  className?: string;
}

/*
 * The starter's navigation, and its two audiences.
 *
 * Deliberately its own, not Vozko's. The chrome around it is identical because
 * the two products share a visual system; the rows are not, because Vozkot
 * carries none of Vozko's CRM, messaging or billing.
 *
 * A "ticket" here is an INGRESSO, admission to an event. The two senses of the
 * word collide in English and share nothing else, which is why the organizer's
 * batches are called tiers ("lotes") throughout and "ingressos" is reserved
 * for what a buyer holds.
 *
 * Rows hold KEYS, not words. The label is resolved where it is drawn, so the
 * spine is translated by the same catalogue as the rest of the app instead of
 * carrying a second, English-only copy of the product's vocabulary.
 *
 * The spine used to offer every account the organizer's console: events, tier
 * management, the door scanner and sales reports. Five of its six rows were
 * tools for running an event, and somebody who had only ever BOUGHT a ticket
 * was handed all of them, each opening onto nothing they owned. That is also
 * how the "601 lotes" report happened: the navigation never distinguished a
 * buyer from an organizer, so neither did anything downstream of it.
 *
 * So the account context comes LAST in this list but FIRST for a buyer: the
 * organizer contexts are filtered out for them, which leaves `account` as
 * products[0] and therefore the landing context. An organizer lands on the box
 * office, which is where their work is, and their own purchases are one switch
 * away rather than mixed in with their sales.
 */
export const defaultProducts: Product[] = [
  {
    id: "box-office",
    nameKey: "product",
    descriptionKey: "productDescription",
    icon: Storefront,
    audience: "organizer",
    navItems: [
      // Events first: an event is what a buyer browses to, and the tiers under
      // it are what they buy. The spine should read in that order.
      { icon: CalendarBlank, labelKey: "events", href: "/events", family: "operations" },
      // "Lotes", not "Ingressos". This screen manages the BATCHES an organizer
      // puts on sale; the buyer's own ingressos live under the account
      // context. Naming both of them "Ingressos" is what made the spine
      // unreadable, because the word then meant two different things one row
      // apart.
      { icon: Stack, labelKey: "tiers", href: "/dashboard", family: "operations" },
      { icon: UserCheck, labelKey: "checkIn", href: "/check-in", family: "operations" },
      // Reserved seating. Under operations rather than in its own context: a
      // room is drawn as part of putting an event on sale, not as a separate
      // job, and an organiser who never sells a numbered seat simply never
      // opens it.
      { icon: SquaresFour, labelKey: "layouts", href: "/venues", family: "operations" },
    ],
  },
  {
    id: "insights",
    nameKey: "insights",
    descriptionKey: "insightsDescription",
    icon: ChartBar,
    audience: "organizer",
    navItems: [
      { icon: ChartBar, labelKey: "reports", href: "/reports", family: "insights" },
      { icon: Receipt, labelKey: "finance", href: "/finance", family: "insights" },
      { icon: UsersThree, labelKey: "audience", href: "/audience", family: "insights" },
    ],
  },
  {
    id: "account",
    nameKey: "account",
    descriptionKey: "accountDescription",
    icon: UserCircle,
    navItems: [
      { icon: Receipt, labelKey: "myTickets", href: "/orders", family: "account" },
    ],
  },
];

/**
 * Rows every context carries.
 *
 * Help is not the property of one context. An organizer looking for it from
 * the box office should not have to switch contexts to find it, and putting a
 * second copy in each product's own list would be two places to keep right.
 */
export const globalNavItems: NavItem[] = [
  { icon: Question, labelKey: "help", href: "/help", family: "support" },
  { icon: Headset, labelKey: "contact", href: "/support", family: "support" },
];

export const adminNavItems: NavItem[] = [
  { icon: Gear, labelKey: "settings", href: "/settings", admin: true },
];

/** The contexts this viewer is offered, in order. */
export function productsFor(products: Product[], isOrganizer: boolean): Product[] {
  const visible = products.filter((product) => !product.audience || isOrganizer);
  // Never nothing: an account with no contexts would render an empty spine and
  // no way out of it.
  return visible.length > 0 ? visible : products.slice(-1);
}

const mobileContainerVariants: Variants = {
  hidden: { x: "-100%" },
  visible: { x: 0, transition: { duration: 0.16, ease: [0.2, 0, 0, 1] } },
  exit: { x: "-100%", transition: { duration: 0.12, ease: [0.2, 0, 0, 1] } },
};

function groupByFamily(
  items: NavItem[],
): { family: string | undefined; items: NavItem[] }[] {
  const groups: { family: string | undefined; items: NavItem[] }[] = [];
  const familyIndex = new Map<string | undefined, number>();

  for (const item of items) {
    const key = item.family;
    const at = familyIndex.get(key);
    if (at !== undefined) {
      groups[at].items.push(item);
    } else {
      familyIndex.set(key, groups.length);
      groups.push({ family: key, items: [item] });
    }
  }

  return groups;
}

function ProductSwitcher({
  currentProduct,
  onProductChange,
  isExpanded,
  products,
}: {
  currentProduct: Product;
  onProductChange: (product: Product) => void;
  isExpanded: boolean;
  products: Product[];
}) {
  const t = useTranslations("nav");
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = React.useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const Icon = currentProduct.icon;

  // The spine is overflow-hidden so its content cannot spill while the width
  // animates, which means the menu has to be measured and portalled out of it.
  useIsomorphicLayoutEffect(() => {
    if (!isOpen) return;
    const place = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.max(r.width, 232);
      setMenuPos({
        top: r.bottom + 4,
        left: Math.min(r.left, window.innerWidth - width - 8),
        width,
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [isOpen]);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // The menu is PORTALLED to document.body, so it is never inside
      // dropdownRef. Checking it separately is what stops this mousedown
      // handler unmounting the menu before a row's click can fire.
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        !(menuRef.current && menuRef.current.contains(target))
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const rows = (
    <>
      {products.map((product) => {
        const ProductIcon = product.icon;
        const isSelected = product.id === currentProduct.id;
        return (
          <button
            key={product.id}
            type="button"
            onClick={() => {
              onProductChange(product);
              setIsOpen(false);
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded-[--radius] px-2 py-2 text-left transition-colors",
              // A menu row keeps a NEUTRAL ground and spends the green on the
              // mark, the lamp and the check. A solid brand block per selected
              // row inside a popover is more signal than the choice is worth.
              isSelected ? "bg-muted" : "hover:bg-muted",
            )}
          >
            <span
              className={cn("lamp", !isSelected && "opacity-0")}
              aria-hidden="true"
            />
            <ProductIcon
              className={cn(
                "size-4 shrink-0",
                isSelected ? "text-foreground" : "text-muted-foreground",
              )}
              weight="regular"
            />
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block truncate text-sm text-foreground",
                  isSelected && "font-semibold",
                )}
              >
                {t(product.nameKey)}
              </span>
              <span className="block truncate text-2xs text-muted-foreground">
                {t(product.descriptionKey)}
              </span>
            </span>
            {isSelected && (
              <Check className="size-3.5 shrink-0 text-primary-ink" weight="bold" />
            )}
          </button>
        );
      })}
    </>
  );

  const menu =
    typeof document !== "undefined" && isOpen && menuPos
      ? createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: menuPos.top,
              left: menuPos.left,
              width: menuPos.width,
            }}
            className="z-[100] rounded-lg border border-border bg-popover p-1 shadow-2xl"
          >
            {rows}
          </div>,
          document.body,
        )
      : null;

  // One context is not a choice.
  //
  // A buyer is offered only the account context, and a menu that opens to show
  // the row already showing is a control that does nothing: it invites a tap,
  // costs a tap, and returns the viewer to where they started. So the switcher
  // becomes a plain heading, and the space it occupies still reads as the
  // spine's title rather than going blank.
  if (products.length < 2) {
    if (!isExpanded) {
      return (
        <div
          className="flex size-9 items-center justify-center text-muted-foreground"
          title={t(currentProduct.nameKey)}
        >
          <Icon className="size-[18px]" weight="regular" aria-hidden="true" />
          <span className="sr-only">{t(currentProduct.nameKey)}</span>
        </div>
      );
    }
    return (
      <div className="flex h-9 w-full items-center gap-2 px-2">
        <Icon
          className="size-[18px] shrink-0 text-muted-foreground"
          weight="regular"
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {t(currentProduct.nameKey)}
        </span>
      </div>
    );
  }

  // The rail form: a square tile, lit only while its menu is open. No accent
  // fill at rest, because in this system the accent means "current", and the
  // product switcher is a control, not a destination.
  if (!isExpanded) {
    return (
      <div ref={dropdownRef} className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-label={t(currentProduct.nameKey)}
          className={cn(
            "flex size-9 items-center justify-center rounded-[--radius] border transition-colors",
            isOpen
              ? "border-border bg-muted text-foreground"
              : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Icon className="size-[18px]" weight="regular" />
        </button>
        {menu}
      </div>
    );
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-[--radius] border px-2 text-left transition-colors",
          isOpen ? "border-border bg-muted" : "border-transparent hover:bg-muted",
        )}
      >
        <Icon className="size-[18px] shrink-0 text-muted-foreground" weight="regular" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {t(currentProduct.nameKey)}
        </span>
        <CaretDown
          className={cn(
            "size-3 shrink-0 text-muted-foreground transition-transform",
            isOpen && "rotate-180",
          )}
          weight="bold"
        />
      </button>
      {menu}
    </div>
  );
}

function NavItemComponent({
  item,
  isExpanded,
  depth = 0,
  onToggle,
  openItems,
  motionEnabled,
  isAdmin = false,
}: {
  item: NavItem;
  isExpanded: boolean;
  depth?: number;
  onToggle: (href: string) => void;
  openItems: Set<string>;
  /** False for the paint that restores remembered families, so they appear
      instantly instead of replaying their accordion on every refresh. */
  motionEnabled: boolean;
  isAdmin?: boolean;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const isOpen = openItems.has(item.href);
  const isActive =
    pathname === item.href ||
    (Boolean(item.children) &&
      item.href !== "/" &&
      Boolean(pathname?.startsWith(item.href + "/")));
  const hasActiveChild = item.children?.some(
    (child) => pathname === child.href || pathname?.startsWith(child.href + "/"),
  );

  /*
    Auto-opening the family that contains the current route is deliberately
    absent. It fights the remembered state on every load: a family the operator
    collapsed on purpose springs back open the moment they navigate into it, so
    the spine can never stay the shape they left it in.

    Orientation does not depend on it. A family whose child is active still
    lights its own row through `hasActiveChild`, so "you are in here" reads with
    the family shut.
  */

  const handleClick = (e: React.MouseEvent) => {
    if (item.children && isExpanded) {
      e.preventDefault();
      onToggle(item.href);
    }
  };

  const isLit = Boolean(isActive || hasActiveChild);

  return (
    <div className="w-full">
      <Link
        href={item.href}
        prefetch={false}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "group relative flex items-center rounded-[--radius] text-sm transition-colors",
          isExpanded ? "h-8 w-full pr-2" : "h-8 w-full justify-center",
          // Selection is SOLID: the brand fill under its dark ink, the same
          // grammar as the primary button. A tinted ground was measured at
          // 1.09:1 against the sidebar while the hover grey measured 1.17:1,
          // so the selected row read FAINTER than the same row under the
          // pointer. Green ink on a green wash is banned outright here.
          isLit
            ? "bg-primary text-primary-foreground shadow-button-primary hover:bg-[hsl(var(--primary-hover))]"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
        onClick={handleClick}
      >
        {isExpanded ? (
          <>
            <span
              className={cn("lamp ml-1 mr-1.5", isLit ? "lamp-on-fill" : "opacity-0")}
              aria-hidden="true"
            />
            <span
              className="flex min-w-0 flex-1 items-center gap-2"
              style={{ paddingLeft: depth > 0 ? `${depth * 0.625}rem` : undefined }}
            >
              {React.createElement(item.icon, {
                className: "size-4 shrink-0",
                weight: "regular",
              })}
              <span
                className={cn(
                  "min-w-0 flex-1 truncate leading-tight",
                  depth > 0 && "text-xs",
                  isLit && "font-semibold",
                )}
              >
                {t(item.labelKey)}
              </span>
              {item.children && (
                <CaretDown
                  className={cn(
                    "size-3 shrink-0 opacity-60 transition-transform",
                    isOpen && "rotate-180",
                  )}
                  weight="bold"
                />
              )}
            </span>
          </>
        ) : (
          <span className="relative flex h-8 w-full items-center justify-center">
            {/* In the rail the lamp sits on the spine edge, where the row's
                left border would be, so "current" is still readable with the
                label hidden. */}
            <span
              className={cn(
                "absolute left-0 top-1/2 -translate-y-1/2 lamp",
                isLit ? "lamp-on-fill" : "opacity-0",
              )}
              aria-hidden="true"
            />
            {React.createElement(item.icon, {
              className: "size-4 shrink-0",
              weight: "regular",
            })}
          </span>
        )}
      </Link>

      <AnimatePresence initial={false}>
        {item.children && isOpen && isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              duration: motionEnabled ? 0.2 : 0,
              ease: [0.1, 0.9, 0.2, 1],
            }}
            className="overflow-hidden"
          >
            {/* An engraved runner, not a coloured rail: children hang off the
                parent's column the way a sub-scale hangs off a panel legend. */}
            <div className="my-0.5 ml-[18px] space-y-px border-l border-border pl-1.5">
              {item.children
                .filter((child) => !child.admin || isAdmin)
                .map((child) => (
                  <NavItemComponent
                    key={child.href}
                    item={child}
                    isExpanded={isExpanded}
                    depth={depth + 1}
                    onToggle={onToggle}
                    openItems={openItems}
                    motionEnabled={motionEnabled}
                    isAdmin={isAdmin}
                  />
                ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function GroupedNavItems({
  items,
  isExpanded,
  onToggle,
  openItems,
  openFamilies,
  toggleFamily,
  motionEnabled,
  isAdmin,
}: {
  items: NavItem[];
  isExpanded: boolean;
  onToggle: (href: string) => void;
  openItems: Set<string>;
  /** Section families the operator has opened; everything else stays shut. */
  openFamilies: Set<string>;
  toggleFamily: (family: string) => void;
  motionEnabled: boolean;
  isAdmin: boolean;
}) {
  const t = useTranslations("nav");
  const groups = groupByFamily(items.filter((item) => !item.admin || isAdmin));

  return (
    <div className={cn("py-1", isExpanded ? "px-2" : "px-1.5")}>
      {groups.map((group, gi) => {
        // A family only collapses where its header exists. In the rail there is
        // no header to click, and an ungrouped run has no family to belong to,
        // so both stay open. Otherwise the operator is left with rows they
        // cannot reach and no control to reveal them.
        const collapsible = Boolean(group.family) && isExpanded;
        const familyOpen = collapsible
          ? openFamilies.has(group.family as string)
          : true;

        return (
          <div key={group.family ?? `ungrouped-${gi}`}>
            {/*
              The section legend rides its engraved rule, the way a console
              legends the bank of strips beneath it, and it IS the control that
              opens the section. In the rail there is no room for the words, so
              the rule alone keeps the grouping.
            */}
            {group.family && isExpanded && (
              <div className={cn("px-1 pb-1 pt-3", gi > 0 && "mt-1")}>
                <button
                  type="button"
                  onClick={() => toggleFamily(group.family as string)}
                  aria-expanded={familyOpen}
                  className="legend group/family flex w-full items-center gap-1.5 rounded-[--radius] px-1 py-0.5 text-left transition-colors hover:!text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {/* min-w-0 is what makes `truncate` actually shrink inside a
                      flex row. Without it the name holds its full width and
                      overlaps the rule instead of ellipsing. */}
                  <span className="min-w-0 truncate">
                    {t(`sections.${group.family}`)}
                  </span>
                  <span aria-hidden="true" className="ml-0.5 h-px flex-1 bg-border" />
                  <CaretDown
                    aria-hidden="true"
                    weight="bold"
                    className={cn(
                      "size-3 shrink-0 opacity-50 transition-transform",
                      motionEnabled ? "duration-150" : "duration-0",
                      familyOpen && "rotate-180",
                    )}
                  />
                </button>
              </div>
            )}
            {(!group.family || !isExpanded) && gi > 0 && (
              <div className="my-1.5 h-px bg-border" />
            )}
            <AnimatePresence initial={false}>
              {familyOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{
                    duration: motionEnabled ? 0.2 : 0,
                    ease: [0.1, 0.9, 0.2, 1],
                  }}
                  className="overflow-hidden"
                >
                  <div className="space-y-px">
                    {group.items.map((item) => (
                      <NavItemComponent
                        key={item.href}
                        item={item}
                        isExpanded={isExpanded}
                        onToggle={onToggle}
                        openItems={openItems}
                        motionEnabled={motionEnabled}
                        isAdmin={isAdmin}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The nav spine.
 *
 * The rail starts BELOW the full-width app bar: the bar owns the corner, which
 * is the shell topology this follows. The spine therefore carries only
 * navigation and opens directly with the product switcher, and its collapse
 * control lives on the bar, so it needs no footer of its own.
 */
export function DashboardSidebar({
  products: allProducts,
  adminNavItems: adminItems = [],
  className,
}: DashboardSidebarProps) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  // Unknown counts as "buyer": offering the smaller, certain spine and adding
  // to it is better than offering tools and taking them away.
  const isOrganizer = useIsOrganizer() === true;
  const products = React.useMemo(
    () => productsFor(allProducts, isOrganizer),
    [allProducts, isOrganizer],
  );

  const { isCollapsed, isMobileOpen, setMobileOpen } = useSidebar();

  // Open unless the operator collapsed it. Hover expands nothing: navigation
  // that appears on approach cannot be scanned, only hunted, and this rail is
  // read continuously for a whole shift.
  const isExpanded = !isCollapsed;

  // Soft navigation must close the mobile drawer; otherwise the veil and drawer
  // panel stay painted over the next route.
  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname, setMobileOpen]);

  // The selected ID is the state; the product is DERIVED from it against the
  // contexts currently on offer.
  //
  // That ordering is what makes a changing set of contexts safe. The set grows
  // and shrinks under the viewer -- the organizer answer arrives after the
  // first paint, and deleting a last event turns an organizer back into a
  // buyer -- and a derived product simply falls back to the first context on
  // offer. Holding the product itself in state would leave the spine pointing
  // at a context no longer in the switcher, reachable by nothing.
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  useIsomorphicLayoutEffect(() => {
    try {
      setSelectedId(localStorage.getItem("dashboard-selected-product"));
    } catch {
      // Private mode or blocked site data: the first context on offer is a
      // perfectly good default.
    }
  }, []);

  const currentProduct =
    products.find((product) => product.id === selectedId) ?? products[0];

  // Written ON THE CLICK, never from an effect mirroring currentProduct.
  //
  // This is the bug that made tabbing away and back move the operator to a
  // different context. currentProduct is DERIVED, and it falls back to
  // products[0] whenever the selected context is not in the list yet, which
  // is every remount, because the organizer answer arrives a moment after the
  // first paint and until then the only context on offer is the account one.
  // An effect that persisted that value could not tell "the operator chose
  // this" from "we defaulted because nothing had loaded", so the fallback
  // overwrote a real choice and the next render honoured it.
  //
  // Storage records a CHOICE, and a choice only happens here.
  // usePersistentOpenSet above guards the same hazard with didRestore.
  const setCurrentProduct = React.useCallback((product: Product) => {
    setSelectedId(product.id);
    try {
      localStorage.setItem("dashboard-selected-product", product.id);
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // Sections start OPEN. A collapsed default meant a first-time operator was
  // shown two section legends and no rows at all, which reads as navigation
  // that failed to load rather than navigation that is put away.
  const allFamilies = React.useMemo(
    () =>
      new Set(
        [
          ...allProducts.flatMap((product) => product.navItems),
          ...globalNavItems,
        ]
          .map((item) => item.family)
          .filter((family): family is string => Boolean(family)),
      ),
    [allProducts],
  );

  // Per-row accordions stay collapsed: those are sub-pages of one row, and the
  // row itself is already visible.
  const [openItems, toggleItem] = usePersistentOpenSet(OPEN_ITEMS_KEY);
  const [openFamilies, toggleFamily] = usePersistentOpenSet(
    OPEN_FAMILIES_KEY,
    () => allFamilies,
  );
  const [motionEnabled, setMotionEnabled] = React.useState(false);

  React.useEffect(() => {
    const id = requestAnimationFrame(() => setMotionEnabled(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const renderSidebarContent = (mobile = false) => (
    <>
      <div
        className={cn(
          "flex-shrink-0 border-b border-border",
          mobile ? "px-2 py-2" : isExpanded ? "px-2 py-2" : "px-1.5 py-2",
        )}
      >
        <ProductSwitcher
          currentProduct={currentProduct}
          onProductChange={setCurrentProduct}
          isExpanded={isExpanded || mobile}
          products={products}
        />
      </div>

      <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <GroupedNavItems
          items={[...currentProduct.navItems, ...globalNavItems]}
          isExpanded={isExpanded || mobile}
          onToggle={toggleItem}
          openItems={openItems}
          openFamilies={openFamilies}
          toggleFamily={toggleFamily}
          motionEnabled={motionEnabled}
          isAdmin={isAdmin}
        />

        {isAdmin && adminItems.length > 0 && (
          <>
            {(isExpanded || mobile) && (
              <div className="mt-2 border-t border-border px-3 pb-1 pt-3">
                <span className="legend">Admin</span>
              </div>
            )}
            <GroupedNavItems
              items={adminItems}
              isExpanded={isExpanded || mobile}
              onToggle={toggleItem}
              openItems={openItems}
              openFamilies={openFamilies}
              toggleFamily={toggleFamily}
              motionEnabled={motionEnabled}
              isAdmin={isAdmin}
            />
          </>
        )}

        {/* The way in.
            A buyer is shown no organizer rows, so without this there is no
            route from the app to selling anything at all: they would have to
            already know /events/new exists. It is an ACTION, not a
            destination, which is why it is a button in its own strip rather
            than a nav row wearing a plus. */}
        {!isOrganizer && (
          <div
            className={cn(
              "mt-2 border-t border-border pb-2 pt-3",
              isExpanded || mobile ? "px-2" : "px-1.5",
            )}
          >
            <Button
              asChild
              size={isExpanded || mobile ? "lg" : "icon"}
              // A square tile in the rail, a full-width button when open: the
              // rail is 52px wide, so a stretched button there would read as a
              // bar rather than a control.
              className={isExpanded || mobile ? "w-full" : "size-9"}
            >
              <Link
                href="/events/new"
                title={isExpanded || mobile ? undefined : t("createEvent")}
              >
                <Plus className="size-4 shrink-0" weight="bold" aria-hidden="true" />
                {isExpanded || mobile ? (
                  <span className="ml-1.5 truncate">{t("createEvent")}</span>
                ) : (
                  <span className="sr-only">{t("createEvent")}</span>
                )}
              </Link>
            </Button>
            {(isExpanded || mobile) && (
              <p className="mt-2 px-1 text-xs leading-5 text-muted-foreground">
                {t("createEventHint")}
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
      <div className="md:hidden">
        {/* The drawer opens from the app bar's hamburger, the same affordance
            that collapses the rail on desktop. */}
        <AnimatePresence>
          {isMobileOpen && (
            <>
              <motion.div
                className="fixed inset-0 z-40 bg-black/50"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                onClick={() => setMobileOpen(false)}
              />

              <motion.div
                variants={mobileContainerVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="fixed inset-y-0 left-0 z-50 flex w-[min(288px,88vw)] flex-col border-r border-sidebar-border bg-sidebar shadow-2xl"
                role="dialog"
                aria-modal="true"
                aria-label="Navigation"
              >
                <div className="flex h-12 flex-shrink-0 items-center justify-between border-b border-border px-3">
                  <BrandLogo markClassName="size-8" />
                  <button
                    type="button"
                    onClick={() => setMobileOpen(false)}
                    className="flex size-8 items-center justify-center rounded-[--radius] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="Close menu"
                  >
                    <X className="size-4" weight="bold" />
                  </button>
                </div>
                <div className="scrollbar-sleek flex min-h-0 flex-1 flex-col overflow-y-auto">
                  {renderSidebarContent(true)}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      <motion.aside
        initial={false}
        animate={{ width: isExpanded ? SPINE_WIDTH_OPEN : SPINE_WIDTH_RAIL }}
        transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
        suppressHydrationWarning
        className={cn(
          "fixed bottom-0 left-0 top-12 z-30 hidden flex-shrink-0",
          // overflow-hidden so the 208px content cannot spill while the width
          // animates down to the 52px rail.
          "overflow-hidden border-r border-sidebar-border bg-sidebar md:flex",
          className,
        )}
      >
        <div className="flex h-full w-full flex-col">{renderSidebarContent()}</div>
      </motion.aside>
    </>
  );
}
