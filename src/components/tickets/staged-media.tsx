"use client";

import * as React from "react";

import { CircleNotch, Play, Plus, Trash } from "@/components/icons";
import {
  MAX_IMAGE_BYTES,
  MAX_MEDIA_PER_TICKET,
  MAX_VIDEO_BYTES,
  acceptedMediaTypes,
} from "@/lib/tickets/types";

import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

export interface StagedFile {
  id: string;
  file: File;
  /** An object URL, revoked when the entry is dropped or the page unmounts. */
  previewUrl: string;
  isVideo: boolean;
}

/**
 * Files chosen before the ticket they belong to exists.
 *
 * The API attaches media to a ticket id, so nothing can be uploaded until the
 * record is created. Rather than leaking that ordering into the interface, fill
 * the form, save, find the ticket again, then add the artwork, the creation
 * page queues the files here and the submit handler uploads them the moment the
 * id comes back. One action to the operator, two calls underneath.
 */
export function useStagedMedia() {
  const [staged, setStaged] = React.useState<StagedFile[]>([]);

  // The queue is mirrored into a ref so the unmount cleanup below can read the
  // final contents without re-subscribing on every change. Written in an
  // effect, never during render.
  const stagedRef = React.useRef<StagedFile[]>([]);
  React.useEffect(() => {
    stagedRef.current = staged;
  }, [staged]);

  // Object URLs live as long as the document unless revoked, so a queue left
  // behind by navigating away would leak every preview it held.
  React.useEffect(
    () => () => {
      for (const entry of stagedRef.current) URL.revokeObjectURL(entry.previewUrl);
    },
    [],
  );

  const add = React.useCallback((files: File[]) => {
    setStaged((current) => {
      const room = MAX_MEDIA_PER_TICKET - current.length;
      const accepted = files.slice(0, Math.max(room, 0)).map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        isVideo: file.type.startsWith("video/"),
      }));
      return [...current, ...accepted];
    });
  }, []);

  const remove = React.useCallback((id: string) => {
    setStaged((current) => {
      const entry = current.find((item) => item.id === id);
      if (entry) URL.revokeObjectURL(entry.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  }, []);

  return { staged, add, remove };
}

interface StagedMediaPickerProps {
  staged: StagedFile[];
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  /** Set while the queue is being uploaded after creation. */
  uploading?: { done: number; total: number } | null;
  disabled?: boolean;
}

export function StagedMediaPicker({
  staged,
  onAdd,
  onRemove,
  uploading,
  disabled,
}: StagedMediaPickerProps) {
  const t = useTranslations("media");
  const form = useTranslations("tickets.form");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);

  const room = MAX_MEDIA_PER_TICKET - staged.length;
  const canAdd = room > 0 && !disabled;

  function accept(files: FileList | File[]) {
    const chosen = Array.from(files);
    if (chosen.length === 0) return;
    if (room <= 0) {
      toast.error(t("limitReached"));
      return;
    }

    // The same allowlist and ceilings the API enforces, applied before the file
    // is ever queued: a 60 MB clip should fail on the spot, not after the
    // ticket has been created and the upload has run for two minutes.
    const valid: File[] = [];
    for (const file of chosen) {
      if (!acceptedMediaTypes.includes(file.type)) {
        toast.error(t("errors.unsupported", { name: file.name }));
        continue;
      }
      const ceiling = file.type.startsWith("video/") ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
      if (file.size > ceiling) {
        toast.error(t("errors.tooLarge", { name: file.name }));
        continue;
      }
      valid.push(file);
    }
    if (valid.length > room) toast.error(t("limitReached"));
    if (valid.length > 0) onAdd(valid);
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="legend">{t("title")}</h3>
        <p className="text-xs tabular-nums text-muted-foreground">
          {uploading
            ? form("uploadingMedia", { done: uploading.done, total: uploading.total })
            : form("mediaQueued", { count: staged.length })}
        </p>
      </div>

      <div
        onDragOver={(event) => {
          if (!canAdd) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (canAdd) accept(event.dataTransfer.files);
        }}
        className={cn(
          "rounded-[--radius] border border-dashed border-border p-2 transition-colors",
          dragging && "border-primary bg-primary-subtle",
        )}
      >
        {staged.length === 0 && !dragging ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={!canAdd}
            className="flex w-full flex-col items-center gap-1.5 rounded-[--radius] px-4 py-8 text-center text-muted-foreground transition-colors hover:bg-accent-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60"
          >
            <Plus size={20} aria-hidden="true" />
            <span className="text-sm font-medium">{t("dropHint")}</span>
            <span className="text-xs">{t("emptyHint")}</span>
          </button>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-3">
            {staged.map((entry, index) => (
              <li key={entry.id} className="relative">
                <span className="block overflow-hidden rounded-[--radius] border border-border bg-muted">
                  <span className="relative block aspect-square">
                    {entry.isVideo ? (
                      <>
                        <video src={entry.previewUrl} preload="metadata" muted playsInline className="size-full object-cover" />
                        <span className="absolute inset-0 grid place-items-center bg-foreground/25">
                          <Play size={18} weight="fill" className="text-white drop-shadow" />
                        </span>
                      </>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={entry.previewUrl} alt="" className="size-full object-cover" />
                    )}
                    {uploading && index === uploading.done && (
                      <span className="absolute inset-0 grid place-items-center bg-background/70">
                        <CircleNotch size={16} className="animate-spin text-muted-foreground" />
                      </span>
                    )}
                    {uploading && index < uploading.done && (
                      <span className="absolute inset-0 bg-background/40" aria-hidden="true" />
                    )}
                  </span>
                </span>

                {index === 0 && (
                  <span className="pointer-events-none absolute left-1 top-1 rounded-sm bg-background px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {t("cover")}
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => onRemove(entry.id)}
                  disabled={Boolean(uploading)}
                  aria-label={t("remove")}
                  className="absolute right-1 top-1 grid size-6 place-items-center rounded-[--radius] bg-background text-muted-foreground shadow-elev-1 transition-colors hover:bg-destructive hover:text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  <Trash size={13} />
                </button>
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
        )}

        {dragging && staged.length === 0 && (
          <p className="px-4 py-8 text-center text-sm font-medium text-primary-ink">{t("dropHere")}</p>
        )}
      </div>

      <p className="mt-1.5 text-xs text-muted-foreground">{t("constraints")}</p>
      <p className="mt-1 text-xs text-muted-foreground">{form("mediaHint")}</p>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={acceptedMediaTypes.join(",")}
        className="sr-only"
        onChange={(event) => {
          if (event.target.files) accept(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}
