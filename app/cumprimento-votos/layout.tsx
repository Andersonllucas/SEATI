import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cumprimento de Votos por Seção | SEATI',
  description: 'Validação pós-eleição, apuração de urnas e cruzamento de votos reais com a base de eleitores',
};

export default function CumprimentoVotosLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
