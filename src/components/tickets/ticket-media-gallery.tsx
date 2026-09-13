"use client";

import * as React from "react";

import { CircleNotch, Play, Plus, Trash, X } from "@/components/icons";
import {
  MAX_IMAGE_BYTES,
  MAX_MEDIA_PER_TICKET,
  MAX_VIDEO_BYTES,
  acceptedMediaTypes,
  type TicketMedia,
} from "@/lib/tickets/types";
import { deleteTicketMedia, uploadTicketMedia } from "@/lib/tickets/api";
import { useLocale, useTranslations } from "next-intl";

import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { formatFileSize } from "@/lib/format";
import { toast } from "sonner";

interface TicketMediaGalleryProps {
  ticketId: string;
  media: TicketMedia[];
  onChanged: () => void | Promise<void>;
}

/**
 * The gallery an operator actually manages: drop files, watch them land, remove
 * the wrong one.
 *
 * Validation runs here as well as on the server. Not because the client is
 * trusted — it is not, and the API rejects the same files independently — but
 * because a 40 MB video that fails after a two-minute upload is a worse answer
 * than one refused the instant it is dropped.
 */
export function TicketMediaGallery({ ticketId, media, onChanged }: TicketMediaGalleryProps) {
  const t = useTranslations("media");
  const locale = useLocale() as Locale;
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState<string[]>([]);
  const [removing, setRemoving] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [preview, setPreview] = React.useState<TicketMedia | null>(null);

  const slotsLeft = MAX_MEDIA_PER_TICKET - media.length - uploading.length;
  const canAdd = slotsLeft > 0;

  const upload = React.useCallback(
    async (files: FileList | File[]) => {
      const chosen = Array.from(files).slice(0, Math.max(slotsLeft, 0));
      if (chosen.length === 0) {
        toast.error(t("limitReached"));
        return;
      }

      for (const file of chosen) {
        const rejection = validate(file);
        if (rejection) {
          toast.error(t(`errors.${rejection}`, { name: file.name }));
          continue;
        }

        setUploading((current) => [...current, file.name]);
        const result = await uploadTicketMedia(ticketId, file);
        setUploading((current) => current.filter((name) => name !== file.name));

        if (result.error) {
          toast.error(result.error.message || t("errors.failed", { name: file.name }));
          continue;
        }
        await onChanged();
      }
    },
    [onChanged, slotsLeft, t, ticketId],
  );

  async function remove(item: TicketMedia) {
    setRemoving(item.id);
    const result = await deleteTicketMedia(ticketId, item.id);
    setRemoving(null);
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    if (preview?.id === item.id) setPreview(null);
    toast.success(t("deleted"));
    await onChanged();
  }

  return (
    <section aria-label={t("title")}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="legend">{t("title")}</h3>
        <p className="text-xs tabular-nums text-muted-foreground">{t("count", { count: media.length })}</p>
      </div>

      <div
        onDragOver={(event) => {
          if (!canAdd) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          // Leaving for a child element still fires here; only a pointer that
          // has actually left the drop zone should clear the state.
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (canAdd && event.dataTransfer.files.length > 0) void upload(event.dataTransfer.files);
        }}
        className={cn(
          "rounded-[--radius] border border-dashed border-border p-2 transition-colors",
          dragging && "border-primary bg-primary-subtle",
        )}
      >
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {media.map((item, index) => (
            <li key={item.id} className="group relative">
              <button
                type="button"
                onClick={() => setPreview(item)}
                className="block w-full overflow-hidden rounded-[--radius] border border-border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="relative block aspect-square">
                  <MediaThumb item={item} />
                  {item.kind === "video" && (
                    <span className="absolute inset-0 grid place-items-center bg-foreground/25">
                      <Play size={20} weight="fill" className="text-white drop-shadow" />
                    </span>
                  )}
                </span>
              </button>

              {index === 0 && (
                <span className="pointer-events-none absolute left-1 top-1 rounded-sm bg-background px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t("cover")}
                </span>
              )}

              <button
                type="button"
                onClick={() => void remove(item)}
                disabled={removing === item.id}
                aria-label={t("remove")}
                className="absolute right-1 top-1 grid size-6 place-items-center rounded-[--radius] bg-background text-muted-foreground shadow-elev-1 transition-colors hover:bg-destructive hover:text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                {removing === item.id ? (
                  <CircleNotch size={13} className="animate-spin" />
                ) : (
                  <Trash size={13} />
                )}
              </button>
            </li>
          ))}

          {uploading.map((name) => (
            <li
              key={name}
              className="grid aspect-square place-items-center gap-1 rounded-[--radius] border border-border bg-muted px-2 text-center"
            >
              <CircleNotch size={18} className="animate-spin text-muted-foreground" />
              <span className="w-full truncate text-[10px] text-muted-foreground">{name}</span>
            </li>
          ))}

          {canAdd && (
            <li>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="grid aspect-square w-full place-items-center gap-1 rounded-[--radius] border border-dashed border-border-strong bg-card text-muted-foreground transition-colors hover:border-primary hover:bg-accent-hover hover:text-primary-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Plus size={18} />
                <span className="px-1 text-[11px] font-medium leading-tight">{t("add")}</span>
              </button>
            </li>
          )}
        </ul>

        {media.length === 0 && uploading.length === 0 && (
          <p className="px-1 pb-1 pt-2 text-xs text-muted-foreground">
            {dragging ? t("dropHere") : t("emptyHint")}
          </p>
        )}
      </div>

      <p className="mt-1.5 text-xs text-muted-foreground">
        {canAdd ? t("constraints") : t("limitReached")}
      </p>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={acceptedMediaTypes.join(",")}
        className="sr-only"
        onChange={(event) => {
          if (event.target.files) void upload(event.target.files);
          // Reset so choosing the same file twice still fires a change.
          event.target.value = "";
        }}
      />

      {preview && (
        <MediaLightbox item={preview} locale={locale} onClose={() => setPreview(null)} closeLabel={t("remove")} />
      )}
    </section>
  );
}

function MediaThumb({ item }: { item: TicketMedia }) {
  if (item.kind === "video") {
    return (
      // preload="metadata" is what paints a first frame without pulling the
      // whole clip down for a thumbnail.
      <video
        src={item.url}
        preload="metadata"
        muted
        playsInline
        className="size-full object-cover"
        aria-hidden="true"
      />
    );
  }
  return (
    // A plain img, deliberately: the CDN hostname of a fork's own R2 bucket is
    // not known at build time, and next/image refuses hosts it was not told
    // about at build time.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={item.url} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
  );
}

function MediaLightbox({
  item,
  locale,
  onClose,
  closeLabel,
}: {
  item: TicketMedia;
  locale: Locale;
  onClose: () => void;
  closeLabel: string;
}) {
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-foreground/70 p-4 backdrop-blur-sm animate-in fade-in-0"
    >
      <div className="relative max-h-full w-full max-w-3xl" onClick={(event) => event.stopPropagation()}>
        {item.kind === "video" ? (
          <video src={item.url} controls autoPlay className="max-h-[80vh] w-full rounded-[--radius] bg-black" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.url} alt="" className="mx-auto max-h-[80vh] rounded-[--radius] object-contain" />
        )}
        <p className="mt-2 text-center text-xs text-white/80">
          {item.contentType} · {formatFileSize(item.sizeBytes, locale)}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="absolute -top-2 right-0 grid size-8 -translate-y-full place-items-center rounded-[--radius] bg-background text-foreground shadow-elev-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

/** Mirrors the server's allowlist and ceilings, so a doomed upload never starts. */
function validate(file: File): "unsupported" | "tooLarge" | null {
  if (!acceptedMediaTypes.includes(file.type)) return "unsupported";
  const ceiling = file.type.startsWith("video/") ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (file.size > ceiling) return "tooLarge";
  return null;
}
