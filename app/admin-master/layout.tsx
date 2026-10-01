import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'PAINEL',
  description: 'Painel Master de Gestão Multi-Tenant e Campanhas',
};

export default function AdminMasterLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
