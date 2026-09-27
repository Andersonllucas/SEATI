'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ShieldAlert, AlertCircle, ArrowLeft, ExternalLink, HelpCircle } from 'lucide-react';

function TenantErrorContent() {
  const searchParams = useSearchParams();
  const subdomain = searchParams.get('subdomain') || 'desconhecido';
  const reason = searchParams.get('reason') || 'not_found';
  const customMessage = searchParams.get('message');

  const isInactive = reason === 'inactive';

  return (
    <div className="min-h-screen bg-surface-container-lowest flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-surface-container-low border border-outline-variant/60 rounded-2xl p-6 sm:p-8 shadow-xl text-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center shadow-inner transition-transform">
          {isInactive ? (
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <ShieldAlert className="w-8 h-8" />
            </div>
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-error/10 text-error flex items-center justify-center">
              <AlertCircle className="w-8 h-8" />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <span className="inline-block px-3 py-1 rounded-full text-[11px] font-mono font-semibold bg-surface-container text-on-surface-variant border border-outline-variant/50">
            {subdomain}.adti.app.br
          </span>
          <h1 className="text-xl sm:text-2xl font-bold font-display text-on-surface">
            {isInactive ? 'Ambiente Temporariamente Desativado' : 'Ambiente Não Localizado'}
          </h1>
          <p className="text-sm text-on-surface-variant leading-relaxed max-w-md mx-auto">
            {customMessage ||
              (isInactive
                ? `O acesso para o cliente vinculado a "${subdomain}.adti.app.br" está pausado ou inativo pela administração da plataforma.`
                : `O subdomínio "${subdomain}.adti.app.br" não está cadastrado em nosso registro central de clientes.`)}
          </p>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-4 text-xs text-on-surface-variant text-left space-y-2">
          <div className="flex items-center gap-2 font-semibold text-on-surface">
            <HelpCircle className="w-4 h-4 text-primary shrink-0" />
            <span>O que fazer agora?</span>
          </div>
          <ul className="list-disc list-inside space-y-1 text-on-surface-variant pl-1">
            <li>Verifique se digitou o endereço do subdomínio corretamente.</li>
            <li>Se você é o coordenador da campanha, acerte a ativação com a equipe técnica.</li>
            <li>Administradores podem gerenciar e ativar subdomínios pelo painel central.</li>
          </ul>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <a
            href="https://admin.adti.app.br"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-on-primary text-xs font-semibold shadow-xs hover:bg-primary/90 transition-colors"
          >
            <span>Acessar Painel Master</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-semibold border border-outline-variant/50 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Tentar Novamente</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TenantErrorPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-container-lowest" />}>
      <TenantErrorContent />
    </Suspense>
  );
}
