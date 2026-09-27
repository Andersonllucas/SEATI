import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-4 text-center">
      <h2 className="text-2xl font-bold text-on-surface mb-2">Página não encontrada</h2>
      <p className="text-sm text-on-surface-variant mb-6">
        A página solicitada não foi encontrada ou foi movida.
      </p>
      <Link
        href="/"
        className="px-4 py-2 bg-primary text-on-primary rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
      >
        Voltar ao Início
      </Link>
    </div>
  );
}
