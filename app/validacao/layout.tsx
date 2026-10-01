import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Validação de Eleitores | SEATI',
  description: 'Controle de checagem e confirmação de votos por ligação e mensagem',
};

export default function ValidacaoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
