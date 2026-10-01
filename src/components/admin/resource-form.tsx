"use client";
import { useState } from "react";
import type { FieldDef } from "@/server/resources";
import type { ActionResult } from "@/server/action";
import { ActionForm, CheckboxField, ImageField, SelectField, SubmitButton, TextAreaField, TextField } from "./client";
import { LinkButton } from "./ui";
import { BR_STATES } from "@/lib/domain";

export type ResourceFormOptions = {
  brands: { id: string; name: string }[];
  suppliers: { id: string; name: string; brandId: string | null }[];
  categories: { id: string; name: string; brandId: string; kind: string }[];
  users: { id: string; name: string }[];
};

function toInputValue(f: FieldDef, v: unknown): string {
  if (v === null || v === undefined) return f.defaultValue !== undefined && typeof f.defaultValue !== "boolean" ? String(f.defaultValue) : "";
  if (f.type === "money") return Number(v).toFixed(2).replace(".", ",");
  if (f.type === "datetime") {
    const d = new Date(String(v));
    if (Number.isNaN(d.getTime())) return "";
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }
  if (f.type === "date") return String(v).slice(0, 10);
  return String(v);
}

export function ResourceForm({
  fields,
  values,
  options,
  action,
  cancelHref,
  submitLabel,
}: {
  fields: FieldDef[];
  values: Record<string, unknown> | null;
  options: ResourceFormOptions;
  action: (prev: ActionResult | null, form: FormData) => Promise<ActionResult>;
  cancelHref: string;
  submitLabel: string;
}) {
  const brandField = fields.find((f) => f.type === "brand" || f.type === "brandOptional");
  const [brandId, setBrandId] = useState<string>(
    String(values?.[brandField?.name ?? "brandId"] ?? (brandField?.type === "brand" && options.brands.length === 1 ? options.brands[0].id : "")),
  );
  const today = new Date().toISOString().slice(0, 10);

  return (
    <ActionForm action={action} className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        {fields.map((f) => {
          const value = values?.[f.name];
          const common = { name: f.name, label: f.label, help: f.help, required: f.required, className: f.wide ? "sm:col-span-2" : undefined };
          switch (f.type) {
            case "textarea":
              return <TextAreaField key={f.name} {...common} defaultValue={toInputValue(f, value)} maxLength={f.max} />;
            case "checkbox":
              return (
                <CheckboxField
                  key={f.name}
                  name={f.name}
                  label={f.label}
                  help={f.help}
                  className={common.className ?? "self-end pb-2"}
                  defaultChecked={value === undefined || value === null ? f.defaultValue === true : Boolean(value)}
                />
              );
            case "select":
              return (
                <SelectField
                  key={f.name}
                  {...common}
                  defaultValue={toInputValue(f, value)}
                  emptyLabel={f.required ? undefined : "Não informado"}
                  options={Object.entries(f.options ?? {}).map(([v, l]) => ({ value: v, label: l }))}
                />
              );
            case "brand":
            case "brandOptional":
              return (
                <div key={f.name} className={common.className}>
                  <label className="admin-label" htmlFor={`f-${f.name}`}>
                    {f.label}
                    {f.type === "brand" && <span className="text-red-700"> *</span>}
                  </label>
                  <select id={`f-${f.name}`} name={f.name} value={brandId} onChange={(e) => setBrandId(e.target.value)} className="admin-input">
                    {(f.type === "brandOptional" || !brandId) && <option value="">{f.type === "brandOptional" ? "Ambas as marcas" : "Escolha"}</option>}
                    {options.brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                  {f.help && <p className="mt-1 text-xs text-stone-500">{f.help}</p>}
                </div>
              );
            case "category":
              return (
                <SelectField
                  key={`${f.name}-${brandId}`}
                  {...common}
                  defaultValue={toInputValue(f, value)}
                  emptyLabel={brandId ? "Nenhuma" : "Escolha a marca primeiro"}
                  options={options.categories
                    .filter((c) => (brandId ? c.brandId === brandId : false) && (f.name === "parentId" ? c.kind === "padrao" && c.id !== values?.id : true))
                    .map((c) => ({ value: c.id, label: c.name }))}
                />
              );
            case "supplier":
              return (
                <SelectField
                  key={f.name}
                  {...common}
                  defaultValue={toInputValue(f, value)}
                  emptyLabel="Nenhum"
                  options={options.suppliers
                    .filter((s) => !brandId || !s.brandId || s.brandId === brandId)
                    .map((s) => ({ value: s.id, label: s.name }))}
                />
              );
            case "user":
              return (
                <SelectField
                  key={f.name}
                  {...common}
                  defaultValue={toInputValue(f, value)}
                  emptyLabel="Ninguém"
                  options={options.users.map((u) => ({ value: u.id, label: u.name }))}
                />
              );
            case "state":
              return (
                <SelectField key={f.name} {...common} defaultValue={toInputValue(f, value)} emptyLabel="UF" options={BR_STATES.map((s) => ({ value: s, label: s }))} />
              );
            case "image":
              return <ImageField key={f.name} {...common} className="sm:col-span-2" defaultValue={toInputValue(f, value)} />;
            case "money":
              return <TextField key={f.name} {...common} inputMode="decimal" placeholder="0,00" defaultValue={toInputValue(f, value)} />;
            case "int":
              return <TextField key={f.name} {...common} type="number" inputMode="numeric" defaultValue={toInputValue(f, value)} />;
            case "date":
              return <TextField key={f.name} {...common} type="date" defaultValue={toInputValue(f, value) || (f.required ? today : "")} />;
            case "datetime":
              return <TextField key={f.name} {...common} type="datetime-local" defaultValue={toInputValue(f, value)} />;
            case "email":
              return <TextField key={f.name} {...common} type="email" defaultValue={toInputValue(f, value)} />;
            case "phone":
              return <TextField key={f.name} {...common} type="tel" inputMode="tel" defaultValue={toInputValue(f, value)} />;
            case "url":
              return <TextField key={f.name} {...common} defaultValue={toInputValue(f, value)} placeholder={f.placeholder ?? "https://"} />;
            default:
              return <TextField key={f.name} {...common} defaultValue={toInputValue(f, value)} maxLength={f.max} placeholder={f.placeholder} />;
          }
        })}
      </div>
      <div className="flex items-center gap-2 border-t border-stone-200 pt-5">
        <SubmitButton>{submitLabel}</SubmitButton>
        <LinkButton href={cancelHref}>Cancelar</LinkButton>
      </div>
    </ActionForm>
  );
}
