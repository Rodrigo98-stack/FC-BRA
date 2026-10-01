"use client";
import { createContext, useActionState, useContext, useEffect, useId, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/server/action";
import { btn, cx } from "./ui";

// ---------------------------------------------------------------------------
// Toasts (feedback visual em todas as ações — §34)
// ---------------------------------------------------------------------------
type ToastItem = { id: number; kind: "success" | "error" | "info"; text: string };

export function toast(kind: ToastItem["kind"], text: string) {
  window.dispatchEvent(new CustomEvent("fcbra-toast", { detail: { kind, text } }));
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    let seq = 0;
    const onToast = (e: Event) => {
      const { kind, text } = (e as CustomEvent<{ kind: ToastItem["kind"]; text: string }>).detail;
      const id = ++seq;
      setItems((list) => [...list.slice(-3), { id, kind, text }]);
      setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), kind === "error" ? 7000 : 4000);
    };
    window.addEventListener("fcbra-toast", onToast);
    return () => window.removeEventListener("fcbra-toast", onToast);
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(92vw,380px)] flex-col gap-2" aria-live="polite" role="status">
      {items.map((t) => (
        <div
          key={t.id}
          className={cx(
            "pointer-events-auto rounded-md border px-4 py-3 text-sm shadow-lg",
            t.kind === "success" && "border-emerald-200 bg-emerald-50 text-emerald-900",
            t.kind === "error" && "border-red-200 bg-red-50 text-red-900",
            t.kind === "info" && "border-stone-200 bg-white text-stone-900",
          )}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formulário ligado a server action (erros por campo + toast + redirect)
// ---------------------------------------------------------------------------
const FieldErrorsContext = createContext<Record<string, string>>({});

export function useFieldError(name: string) {
  return useContext(FieldErrorsContext)[name];
}

export function ActionForm({
  action,
  children,
  className,
  successMessage,
  onSuccess,
  resetOnSuccess,
  refresh = true,
}: {
  action: (prev: ActionResult | null, form: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  className?: string;
  successMessage?: string;
  onSuccess?: (res: ActionResult) => void;
  resetOnSuccess?: boolean;
  refresh?: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(action, null);
  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast("success", state.message ?? successMessage ?? "Salvo.");
      if (resetOnSuccess) formRef.current?.reset();
      onSuccess?.(state);
      if (state.redirectTo) router.push(state.redirectTo);
      else if (refresh) router.refresh();
    } else {
      toast("error", state.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <FieldErrorsContext.Provider value={errors}>
      <form ref={formRef} action={formAction} className={className} noValidate>
        {state && !state.ok && Object.keys(errors).length > 0 && (
          <div role="alert" className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {state.error}
          </div>
        )}
        {children}
      </form>
    </FieldErrorsContext.Provider>
  );
}

export function SubmitButton({
  children,
  pendingText = "Salvando…",
  variant = "primary",
  className,
  name,
  value,
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending} className={cx(btn.base, btn[variant], className)}>
      {pending ? pendingText : children}
    </button>
  );
}

export function FieldError({ name }: { name: string }) {
  const error = useFieldError(name);
  if (!error) return null;
  return <p className="mt-1 text-xs text-red-700">{error}</p>;
}

type BaseFieldProps = {
  name: string;
  label: string;
  help?: string;
  required?: boolean;
  className?: string;
};

export function TextField({
  name,
  label,
  help,
  required,
  className,
  type = "text",
  defaultValue,
  placeholder,
  maxLength,
  inputMode,
  autoComplete,
  step,
}: BaseFieldProps & {
  type?: string;
  defaultValue?: string | number | null;
  placeholder?: string;
  maxLength?: number;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
  step?: string;
}) {
  const id = useId();
  const error = useFieldError(name);
  return (
    <div className={className}>
      <label htmlFor={id} className="admin-label">
        {label}
        {required && <span className="text-red-700"> *</span>}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        maxLength={maxLength}
        inputMode={inputMode}
        autoComplete={autoComplete}
        step={step}
        aria-invalid={error ? true : undefined}
        className={cx("admin-input", error && "border-red-400")}
      />
      {help && !error && <p className="mt-1 text-xs text-stone-500">{help}</p>}
      <FieldError name={name} />
    </div>
  );
}

export function TextAreaField({
  name,
  label,
  help,
  required,
  className,
  defaultValue,
  rows = 4,
  maxLength,
  placeholder,
}: BaseFieldProps & { defaultValue?: string | null; rows?: number; maxLength?: number; placeholder?: string }) {
  const id = useId();
  const error = useFieldError(name);
  return (
    <div className={className}>
      <label htmlFor={id} className="admin-label">
        {label}
        {required && <span className="text-red-700"> *</span>}
      </label>
      <textarea
        id={id}
        name={name}
        rows={rows}
        defaultValue={defaultValue ?? ""}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        className={cx("admin-input", error && "border-red-400")}
      />
      {help && !error && <p className="mt-1 text-xs text-stone-500">{help}</p>}
      <FieldError name={name} />
    </div>
  );
}

export function SelectField({
  name,
  label,
  help,
  required,
  className,
  defaultValue,
  options,
  emptyLabel,
}: BaseFieldProps & {
  defaultValue?: string | null;
  options: { value: string; label: string }[];
  emptyLabel?: string;
}) {
  const id = useId();
  const error = useFieldError(name);
  return (
    <div className={className}>
      <label htmlFor={id} className="admin-label">
        {label}
        {required && <span className="text-red-700"> *</span>}
      </label>
      <select id={id} name={name} defaultValue={defaultValue ?? ""} aria-invalid={error ? true : undefined} className={cx("admin-input", error && "border-red-400")}>
        {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {help && !error && <p className="mt-1 text-xs text-stone-500">{help}</p>}
      <FieldError name={name} />
    </div>
  );
}

export function CheckboxField({
  name,
  label,
  defaultChecked,
  className,
  help,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
  className?: string;
  help?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="flex items-start gap-2.5 text-sm text-stone-800">
        <input id={id} type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 h-4 w-4 accent-stone-900" />
        <span>
          {label}
          {help && <span className="block text-xs text-stone-500">{help}</span>}
        </span>
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload de imagem (vai para /api/admin/upload) ou URL colada
// ---------------------------------------------------------------------------
export function ImageField({
  name,
  label,
  defaultValue,
  help,
  required,
  className,
}: BaseFieldProps & { defaultValue?: string | null }) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const error = useFieldError(name);

  async function upload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      const json = (await res.json()) as { ok: boolean; url?: string; error?: string };
      if (!json.ok || !json.url) throw new Error(json.error ?? "Falha no envio.");
      setValue(json.url);
      toast("success", "Imagem enviada.");
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className={className}>
      <label htmlFor={id} className="admin-label">
        {label}
        {required && <span className="text-red-700"> *</span>}
      </label>
      <div className="flex items-start gap-3">
        <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-md border border-stone-200 bg-stone-50 text-[10px] text-stone-400">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            "Sem imagem"
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <input
            id={id}
            name={name}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://… ou envie um arquivo"
            className={cx("admin-input", error && "border-red-400")}
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className={cx(btn.base, btn.secondary, "py-1.5 text-xs")}>
              {uploading ? "Enviando…" : "Enviar arquivo"}
            </button>
            {value && (
              <button type="button" onClick={() => setValue("")} className={cx(btn.base, btn.ghost, "py-1.5 text-xs")}>
                Remover
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif,image/gif,image/x-icon"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
        </div>
      </div>
      {help && !error && <p className="mt-1 text-xs text-stone-500">{help}</p>}
      <FieldError name={name} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ações sensíveis: confirmação dupla (motivo + digitar CONFIRMAR) — §35.8
// ---------------------------------------------------------------------------
export function ConfirmAction({
  label,
  title,
  description,
  action,
  variant = "dangerOutline",
  requireReason = true,
  requireTyping = true,
  confirmLabel = "Confirmar",
  className,
}: {
  label: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action: (reason: string) => Promise<ActionResult>;
  variant?: "danger" | "dangerOutline" | "secondary" | "primary" | "ghost";
  requireReason?: boolean;
  requireTyping?: boolean;
  confirmLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const ready = (!requireReason || reason.trim().length >= 3) && (!requireTyping || typed.trim().toUpperCase() === "CONFIRMAR");

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cx(btn.base, btn[variant], className)}>
        {label}
      </button>
      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        className="w-[min(92vw,460px)] rounded-lg border border-stone-200 p-0 shadow-xl backdrop:bg-stone-900/40"
      >
        <div className="p-6">
          <h2 className="text-lg font-semibold text-stone-900">{title}</h2>
          {description && <div className="mt-2 text-sm text-stone-600">{description}</div>}
          {requireReason && (
            <label className="mt-5 block">
              <span className="admin-label">Motivo (fica registrado na auditoria)</span>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} className="admin-input" />
            </label>
          )}
          {requireTyping && (
            <label className="mt-4 block">
              <span className="admin-label">
                Digite <strong>CONFIRMAR</strong> para continuar
              </span>
              <input value={typed} onChange={(e) => setTyped(e.target.value)} className="admin-input" autoComplete="off" />
            </label>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className={cx(btn.base, btn.secondary)}>
              Cancelar
            </button>
            <button
              type="button"
              disabled={!ready || pending}
              onClick={() =>
                start(async () => {
                  const res = await action(reason.trim());
                  if (res.ok) {
                    toast("success", res.message ?? "Concluído.");
                    setOpen(false);
                    setReason("");
                    setTyped("");
                    if (res.redirectTo) router.push(res.redirectTo);
                    else router.refresh();
                  } else {
                    toast("error", res.error);
                  }
                })
              }
              className={cx(btn.base, variant === "primary" || variant === "secondary" ? btn.primary : btn.danger)}
            >
              {pending ? "Processando…" : confirmLabel}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

/** Botão simples que executa uma server action e mostra o resultado. */
export function ActionButton({
  action,
  children,
  variant = "secondary",
  className,
  pendingText = "Aguarde…",
}: {
  action: () => Promise<ActionResult>;
  children: React.ReactNode;
  variant?: keyof Omit<typeof btn, "base">;
  className?: string;
  pendingText?: string;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      className={cx(btn.base, btn[variant], className)}
      onClick={() =>
        start(async () => {
          const res = await action();
          if (res.ok) {
            toast("success", res.message ?? "Concluído.");
            if (res.redirectTo) router.push(res.redirectTo);
            else router.refresh();
          } else toast("error", res.error);
        })
      }
    >
      {pending ? pendingText : children}
    </button>
  );
}

/** Link copiável (convites, redefinição de senha, mensagens de WhatsApp). */
export function CopyBox({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-md border border-stone-200 bg-stone-50 p-3">
      {label && <p className="mb-2 text-xs text-stone-500">{label}</p>}
      <div className="flex gap-2">
        <input readOnly value={value} className="admin-input bg-white font-mono text-xs" onFocus={(e) => e.target.select()} />
        <button
          type="button"
          className={cx(btn.base, btn.secondary)}
          onClick={async () => {
            await navigator.clipboard.writeText(value).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
    </div>
  );
}

/** Envia um formulário GET ao mudar um select (filtros e seletores). */
export function AutoSubmitSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
