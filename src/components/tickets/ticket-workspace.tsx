"use client";

import * as React from "react";

import { CircleNotch, MagnifyingGlass, Plus, Receipt, Warning } from "@/components/icons";
import { TicketList, TicketListSkeleton } from "@/components/tickets/ticket-list";
import { changeTicketStatus, deleteTicket, getTicket, listTickets } from "@/lib/tickets/api";
import { formatMoney, formatNumber } from "@/lib/format";
import { totalAvailable, totalStockValue, ticketStatuses, type Ticket, type TicketSort, type TicketStatus } from "@/lib/tickets/types";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DashboardPageHeader } from "@/components/dashboard/page-header";
import { Link, useRouter } from "@/i18n/routing";
import type { Locale } from "@/i18n/config";
import { SelectField } from "@/components/ui/field";
import { TicketDetail } from "@/components/tickets/ticket-detail";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useSearchParams } from "next/navigation";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

/**
 * The box office workspace: the catalogue on the left, the record on the right.
 *
 * Master-detail rather than a table plus a modal, because the work here is
 * comparative — an operator prices one batch against the others and needs both
 * in view. Below lg there is no room for both, so the panel takes the screen
 * and the list comes back with one control.
 */
export function TicketWorkspace() {
  const t = useTranslations("tickets");
  const common = useTranslations("common");
  const locale = useLocale() as Locale;

  const [search, setSearch] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<TicketStatus | "">("");
  const [sort, setSort] = React.useState<TicketSort>("starts_at");

  const [tickets, setTickets] = React.useState<Ticket[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  // The catalogue's selection is addressable: the create and edit pages return
  // here as /?ticket=<id>, so the operator lands on the record they just wrote
  // instead of an unfiltered list.
  const searchParams = useSearchParams();
  const router = useRouter();
  const [selectedId, setSelectedId] = React.useState<string | null>(searchParams.get("ticket"));
  const [deleting, setDeleting] = React.useState<Ticket | null>(null);
  const [statusPending, setStatusPending] = React.useState(false);

  // The typed value drives the input; the debounced copy drives the request, so
  // a four-letter venue name is one query instead of four.
  React.useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [search]);

  /** Bumped to re-run the query the filters currently describe. */
  const [reloadToken, setReloadToken] = React.useState(0);
  const reload = React.useCallback(() => setReloadToken((value) => value + 1), []);

  React.useEffect(() => {
    // `active` discards a response whose request has already been superseded.
    // Typing "aurora" fires one request per debounce window, and without this
    // guard a slow earlier answer can land last and repopulate the list with
    // results for a query the operator has moved on from.
    let active = true;

    async function run() {
      setLoading(true);
      setFailed(false);
      const result = await listTickets({ q: query, status, sort, limit: PAGE_SIZE });
      if (!active) return;

      if (result.error || !result.data) {
        setFailed(true);
        setTickets([]);
        setTotal(0);
        setLoading(false);
        return;
      }
      setTickets(result.data.data);
      setTotal(result.data.total);
      setLoading(false);
    }

    void run();
    return () => {
      active = false;
    };
  }, [query, reloadToken, sort, status]);

  async function loadMore() {
    setLoadingMore(true);
    const result = await listTickets({ q: query, status, sort, limit: PAGE_SIZE, offset: tickets.length });
    setLoadingMore(false);
    if (result.error || !result.data) {
      toast.error(result.error?.message ?? "");
      return;
    }
    setTickets((current) => [...current, ...result.data!.data]);
    setTotal(result.data.total);
  }

  /** Re-reads one ticket after an edit or an upload without refetching the page. */
  const refreshSelected = React.useCallback(async () => {
    if (!selectedId) return;
    const result = await getTicket(selectedId);
    if (!result.data) return;
    const fresh = result.data;
    setTickets((current) => current.map((item) => (item.id === fresh.id ? fresh : item)));
  }, [selectedId]);

  const selected = tickets.find((ticket) => ticket.id === selectedId) ?? null;
  const filtered = Boolean(query.trim() || status);

  async function onStatusChange(next: TicketStatus) {
    if (!selected) return;
    setStatusPending(true);
    const result = await changeTicketStatus(selected.id, next);
    setStatusPending(false);
    if (result.error || !result.data) {
      toast.error(result.error?.message ?? "");
      return;
    }
    const fresh = result.data;
    setTickets((current) => current.map((item) => (item.id === fresh.id ? fresh : item)));
    toast.success(t("feedback.statusChanged"));
  }

  async function confirmDelete() {
    if (!deleting) return;
    const target = deleting;
    const result = await deleteTicket(target.id);
    if (result.error) {
      toast.error(result.error.message);
      // Thrown so ConfirmDialog keeps itself open for a retry.
      throw new Error(result.error.message);
    }
    setDeleting(null);
    if (selectedId === target.id) setSelectedId(null);
    toast.success(t("feedback.deleted"));
    reload();
  }

  return (
    <div className="mx-auto max-w-[1600px]">
      <DashboardPageHeader
        icon={<Receipt weight="regular" />}
        title={t("page.title")}
        description={t("page.description")}
        actions={
          <Button size="sm" asChild>
            <Link href="/tickets/new">
              <Plus size={16} />
              {t("actions.create")}
            </Link>
          </Button>
        }
      />

      {/* One line of inline facts rather than a rack of stat cards: the numbers
          are context for the list below, not the page's subject. */}
      <p className="mt-3 text-xs text-muted-foreground">
        <span className="tabular-nums">{t("summary.batches", { count: total })}</span>
        {tickets.length > 0 && (
          <>
            {" · "}
            <span className="tabular-nums">
              {t("summary.available", { count: totalAvailable(tickets) })}
            </span>
            {" · "}
            <span className="tabular-nums">
              {t("summary.potential", {
                value: formatMoney(totalStockValue(tickets), locale, tickets[0]?.currency ?? "BRL"),
              })}
            </span>
          </>
        )}
      </p>

      <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] xl:grid-cols-[minmax(0,1fr)_minmax(0,480px)]">
        <section
          className={cn(
            "min-w-0 rounded-[--radius] border border-border bg-card shadow-sm",
            selected && "hidden lg:block",
          )}
          aria-label={t("page.title")}
        >
          <div className="border-b border-border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <MagnifyingGlass
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t("toolbar.searchPlaceholder")}
                  aria-label={t("toolbar.searchLabel")}
                  className="h-9 w-full rounded-[--radius] border border-control-edge bg-card pl-9 pr-3 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground hover:border-[hsl(var(--muted-foreground)/0.5)] focus-visible:shadow-[inset_0_-2px_0_0_hsl(var(--primary-edge))] focus-visible:ring-2 focus-visible:ring-primary/15 dark:bg-muted"
                />
              </div>
              <SelectField
                value={sort}
                onChange={(event) => setSort(event.target.value as TicketSort)}
                aria-label={t("toolbar.sortLabel")}
                className="w-auto min-w-[9.5rem]"
              >
                <option value="starts_at">{t("toolbar.sortStartsAt")}</option>
                <option value="created_at">{t("toolbar.sortCreatedAt")}</option>
                <option value="price">{t("toolbar.sortPrice")}</option>
              </SelectField>
            </div>

            <div
              className="-mx-1 mt-2 flex gap-1 overflow-x-auto px-1 pb-0.5"
              role="group"
              aria-label={t("toolbar.statusLabel")}
            >
              <FilterChip active={status === ""} onClick={() => setStatus("")}>
                {t("toolbar.statusAll")}
              </FilterChip>
              {ticketStatuses.map((value) => (
                <FilterChip key={value} active={status === value} onClick={() => setStatus(value)}>
                  {t(`status.${value}`)}
                </FilterChip>
              ))}
            </div>
          </div>

          {loading ? (
            <TicketListSkeleton />
          ) : failed ? (
            <EmptyPanel
              icon={<Warning size={20} />}
              title={t("error.title")}
              body={t("error.body")}
              action={
                <Button size="sm" variant="outline" onClick={reload}>
                  {common("retry")}
                </Button>
              }
            />
          ) : tickets.length === 0 ? (
            filtered ? (
              <EmptyPanel
                icon={<MagnifyingGlass size={20} />}
                title={t("emptyFiltered.title")}
                body={t("emptyFiltered.body")}
                action={
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSearch("");
                      setStatus("");
                    }}
                  >
                    {t("emptyFiltered.action")}
                  </Button>
                }
              />
            ) : (
              <EmptyPanel
                icon={<Receipt size={20} />}
                title={t("empty.title")}
                body={t("empty.body")}
                action={
                  <Button size="sm" asChild>
                    <Link href="/tickets/new">
                      <Plus size={16} />
                      {t("empty.action")}
                    </Link>
                  </Button>
                }
              />
            )
          ) : (
            <>
              <TicketList tickets={tickets} selectedId={selectedId} onSelect={(ticket) => setSelectedId(ticket.id)} />
              <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2">
                <p className="text-xs tabular-nums text-muted-foreground">
                  {t("list.showing", {
                    shown: formatNumber(tickets.length, locale),
                    total: formatNumber(total, locale),
                  })}
                </p>
                {tickets.length < total && (
                  <Button size="sm" variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
                    {loadingMore && <CircleNotch className="animate-spin" />}
                    {loadingMore ? t("list.loadingMore") : t("list.loadMore")}
                  </Button>
                )}
              </div>
            </>
          )}
        </section>

        <section
          className={cn(
            "min-w-0 rounded-[--radius] border border-border bg-card shadow-sm",
            "lg:sticky lg:top-[4.25rem] lg:max-h-[calc(100vh-5.5rem)] lg:overflow-hidden",
            !selected && "hidden lg:flex lg:items-center lg:justify-center",
          )}
          aria-label={t("list.selectHint")}
        >
          {selected ? (
            <TicketDetail
              ticket={selected}
              statusPending={statusPending}
              onEdit={() => router.push(`/tickets/${selected.id}/edit`)}
              onDelete={() => setDeleting(selected)}
              onStatusChange={onStatusChange}
              onMediaChanged={refreshSelected}
              onBack={() => setSelectedId(null)}
            />
          ) : (
            <p className="px-6 py-16 text-center text-sm text-muted-foreground">{t("list.selectHint")}</p>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("delete.title")}
        description={
          deleting
            ? t("delete.body", { title: deleting.title, event: deleting.eventName })
            : undefined
        }
        confirmLabel={t("delete.confirm")}
        cancelLabel={common("cancel")}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-primary-edge bg-primary-subtle text-primary-ink"
          : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function EmptyPanel({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="px-6 py-14 text-center">
      <span className="mx-auto grid size-10 place-items-center rounded-full bg-muted text-muted-foreground" aria-hidden="true">
        {icon}
      </span>
      <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">{body}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
