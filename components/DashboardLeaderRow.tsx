'use client';

import React from 'react';

interface DashboardLeaderRowProps {
  lider: {
    id: string;
    nome: string;
    tipo: string;
    regiao: string;
    meta: number;
    captados: number;
    pct: number;
    status: string;
  };
}

export const DashboardLeaderRow = React.memo(function DashboardLeaderRow({
  lider
}: DashboardLeaderRowProps) {
  return (
    <tr className="hover:bg-surface-container-low transition-colors">
      <td className="py-3 px-3 font-bold text-on-surface">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-surface-container-high flex items-center justify-center font-bold text-primary text-xs shrink-0">
            {lider.nome.charAt(0).toUpperCase()}
          </div>
          <span className="truncate max-w-[180px]">{lider.nome}</span>
        </div>
      </td>
      <td className="py-3 px-3 text-on-surface-variant font-medium">{lider.tipo}</td>
      <td className="py-3 px-3 text-on-surface-variant">{lider.regiao}</td>
      <td className="py-3 px-3 text-right font-semibold text-on-surface">
        {lider.meta > 0 ? lider.meta.toLocaleString('pt-BR') : '-'}
      </td>
      <td className="py-3 px-3 text-right font-bold text-primary">
        {lider.captados.toLocaleString('pt-BR')}
      </td>
      <td className="py-3 px-3 text-center">
        <div className="inline-flex items-center gap-1.5">
          <div className="w-16 h-2 rounded bg-surface-container overflow-hidden hidden sm:block">
            <div
              className={`h-full rounded ${
                lider.pct >= 100
                  ? 'bg-emerald-500'
                  : lider.pct >= 50
                  ? 'bg-primary-container'
                  : 'bg-secondary'
              }`}
              style={{ width: `${Math.min(lider.pct, 100)}%` }}
            ></div>
          </div>
          <span
            className={`font-bold ${
              lider.pct >= 100
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-on-surface'
            }`}
          >
            {lider.pct}%
          </span>
        </div>
      </td>
      <td className="py-3 px-3 text-center">
        <span
          className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
            lider.status === 'Ativa'
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
              : 'bg-surface-container text-on-surface-variant'
          }`}
        >
          {lider.status}
        </span>
      </td>
    </tr>
  );
});
