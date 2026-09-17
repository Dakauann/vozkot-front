"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import ElevatedInput from "@/components/elevated-design/elevated-input";
import { MapPin } from "@/components/icons";
import { Field, SelectField } from "@/components/ui/field";
import { GENDERS, UFS, type Gender } from "@/lib/reports/types";

/**
 * The three optional things we ask a buyer about themselves.
 *
 * One component, used by the sign-up identity step and by the settings screen,
 * because two copies of a form that writes the same three columns drift the
 * first time one of them gains a field. It is deliberately NOT part of the
 * identity fieldset above it: those fields are legally required and block a
 * purchase, these are volunteered and must never block anything.
 *
 * Everything here is optional and says so on screen. "Prefiro não informar" is
 * a real choice rather than the absence of one, and leaving the whole block
 * untouched is equally fine — the report counts both as "não informado".
 */

export interface AudienceValue {
  gender: Gender | "";
  city: string;
  uf: string;
}

export const emptyAudience: AudienceValue = { gender: "", city: "", uf: "" };

export function AudienceFields({
  value,
  onChange,
  idPrefix = "audience",
  disabled,
}: {
  value: AudienceValue;
  onChange: (next: AudienceValue) => void;
  /** Namespaces the control ids, so two of these on one page stay distinct. */
  idPrefix?: string;
  disabled?: boolean;
}) {
  const t = useTranslations("audience");

  const set = <Key extends keyof AudienceValue>(key: Key) =>
    (next: AudienceValue[Key]) => onChange({ ...value, [key]: next });

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-medium text-foreground">{t("title")}</p>
        {/* Said at the point of asking, not buried in a policy page: what it is
            for, and that it is genuinely optional. */}
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t("why")}</p>
      </div>

      <Field id={`${idPrefix}-gender`} label={t("gender")}>
        <SelectField
          id={`${idPrefix}-gender`}
          value={value.gender}
          disabled={disabled}
          onChange={(event) => set("gender")(event.target.value as Gender | "")}
          className="h-11"
        >
          {/* The empty option is first and is a real answer: it is what
              somebody who has not decided leaves selected. */}
          <option value="">{t("unanswered")}</option>
          {GENDERS.map((gender) => (
            <option key={gender} value={gender}>
              {t(`genders.${gender}`)}
            </option>
          ))}
        </SelectField>
      </Field>

      <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
        <ElevatedInput
          id={`${idPrefix}-city`}
          label={t("city")}
          icon={<MapPin size={18} aria-hidden />}
          value={value.city}
          disabled={disabled}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => set("city")(event.target.value)}
          autoComplete="address-level2"
          maxLength={120}
        />
        <Field id={`${idPrefix}-uf`} label={t("uf")}>
          <SelectField
            id={`${idPrefix}-uf`}
            value={value.uf}
            disabled={disabled}
            onChange={(event) => set("uf")(event.target.value)}
            className="h-11"
          >
            <option value="">—</option>
            {UFS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </SelectField>
        </Field>
      </div>
    </div>
  );
}
