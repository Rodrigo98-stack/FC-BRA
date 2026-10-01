import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <p className="text-sm text-stone-500">Erro 404</p>
      <h1 className="mt-3 text-3xl font-semibold text-stone-900">Página não encontrada</h1>
      <p className="mt-3 max-w-sm text-stone-600">O endereço pode ter mudado ou o conteúdo foi removido.</p>
      <Link href="/" className="mt-8 rounded-md bg-stone-900 px-5 py-2.5 text-sm font-medium text-white">Ir para o início</Link>
    </main>
  );
}
