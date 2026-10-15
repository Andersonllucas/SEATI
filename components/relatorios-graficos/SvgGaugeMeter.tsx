'use client';

import React from 'react';

interface SvgGaugeMeterProps {
  current: number;
  target: number;
  title: string;
  subtitle?: string;
  color?: string;
  trackColor?: string;
  size?: number;
  className?: string;
  unit?: string;
}

export function SvgGaugeMeter({
  current,
  target,
  title,
  subtitle,
  color = '#255fa5',
  trackColor = '#e2e8f0',
  size = 180,
  className = '',
  unit = 'votos'
}: SvgGaugeMeterProps) {
  const percentage = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;

  // Semicírculo de 180 graus (ou arco de 240 graus)
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  // Usando um arco de 240 graus (iniciando em 150 deg até 390 deg)
  const arcLength = (240 / 360) * circumference;
  const strokeDashoffset = arcLength - (percentage / 100) * arcLength;

  return (
    <div className={`flex flex-col items-center text-center p-3 ${className}`}>
      <div className="relative" style={{ width: size, height: size * 0.85 }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="transform rotate-[150deg] overflow-visible"
        >
          {/* Pista de Fundo */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={trackColor}
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeLinecap="round"
          />

          {/* Arco de Preenchimento */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-700 ease-out"
          />
        </svg>

        {/* Informações Centrais */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-4 pointer-events-none">
          <span className="text-3xl font-extrabold font-display text-slate-800 tracking-tight leading-none">
            {percentage}%
          </span>
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mt-1">
            da Meta
          </span>
        </div>
      </div>

      {/* Rótulo e Valores */}
      <div className="mt-1">
        <h4 className="text-sm font-bold text-slate-800">{title}</h4>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        <div className="flex items-center justify-center gap-1.5 mt-2 font-mono text-xs">
          <span className="font-bold text-slate-900">{current.toLocaleString('pt-BR')}</span>
          <span className="text-slate-400">/</span>
          <span className="text-slate-600">{target.toLocaleString('pt-BR')} {unit}</span>
        </div>
      </div>
    </div>
  );
}
