import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Central de Relatórios & Impressão | SEATI',
  description: 'Emissão, impressão e exportação completa de relatórios eleitorais por zona, seção, líder e sub-líder.',
};

export default function RelatoriosLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
