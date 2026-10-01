"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold text-stone-900">Algo não saiu como esperado</h1>
      <p className="mt-3 max-w-sm text-stone-600">Não foi possível carregar esta página agora. Tente novamente em instantes.</p>
      <button onClick={reset} className="mt-8 rounded-md bg-stone-900 px-5 py-2.5 text-sm font-medium text-white">
        Tentar novamente
      </button>
    </main>
  );
}
