"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  AudienceFields,
  emptyAudience,
  type AudienceValue,
} from "@/components/auth/audience-fields";
import { getProfile, saveProfile } from "@/lib/auth/verification";
import type { Gender } from "@/lib/reports/types";

/**
 * Editing the optional answers after the fact.
 *
 * It exists because the sign-up step only ever appears once, and only for an
 * account whose identity block is still empty. Without this, every account that
 * existed before these fields did could never answer them, and the audience
 * report would read "não informado" for the whole back catalogue with no way
 * for anybody to fix it.
 *
 * The identity block itself is deliberately NOT editable here. A document and a
 * legal name are what the door checks against, and a screen that lets somebody
 * change them after buying is a screen that lets one person's ticket be
 * admitted under another person's name.
 */
export function AudienceSettings() {
  const tCommon = useTranslations("common");

  const [value, setValue] = React.useState<AudienceValue>(emptyAudience);
  const [loaded, setLoaded] = React.useState<{
    documentType: string;
    legalName: string;
    birthDate: string;
  } | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [unavailable, setUnavailable] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await getProfile();
      if (cancelled) return;
      if (!data || !data.complete) {
        // No identity block yet: this account has not been through the sign-up
        // step, which is where these are asked for the first time. Showing an
        // edit form for the optional half alone would be confusing, so the
        // block simply does not render.
        setUnavailable(true);
        return;
      }
      setLoaded({
        documentType: data.documentType ?? "cpf",
        legalName: data.legalName ?? "",
        birthDate: data.birthDate ?? "",
      });
      setValue({
        gender: (data.gender as Gender | "") ?? "",
        city: data.city ?? "",
        uf: data.uf ?? "",
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (unavailable || !loaded) return null;

  const submit = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault();
    setSaving(true);
    // The identity fields are sent back UNCHANGED. The endpoint writes the
    // whole block at once, so omitting them would blank a document somebody
    // needs at the door; the document itself is never returned by the API, and
    // is never sent from here, so it keeps whatever it already had.
    const { error } = await saveProfile({
      documentType: loaded.documentType,
      document: "",
      legalName: loaded.legalName,
      birthDate: loaded.birthDate,
      ...value,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(tCommon("save"));
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-[--radius] border border-border bg-card p-5 shadow-sm"
    >
      <AudienceFields value={value} onChange={setValue} idPrefix="settings" disabled={saving} />
      <button
        type="submit"
        disabled={saving}
        className="mt-4 inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
      >
        {tCommon("save")}
      </button>
    </form>
  );
}
