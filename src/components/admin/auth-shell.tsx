import { Toaster } from "./client";

export function AuthShell({ title, description, children }: { title: string; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-stone-100 px-4 py-12">
      <div className="w-full max-w-[400px]">
        <p className="mb-8 text-center text-xs font-medium tracking-[0.18em] text-stone-500">FINA CLÁSSICA + BRAVUS</p>
        <div className="rounded-lg border border-stone-200 bg-white p-7 shadow-sm">
          <h1 className="text-xl font-semibold text-stone-900">{title}</h1>
          {description && <div className="mt-1.5 text-sm text-stone-600">{description}</div>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
      <Toaster />
    </main>
  );
}
