'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import {
  ExternalLink,
  Link2,
  UserPlus,
  MessageCircle,
  FileText,
  Globe,
  Star,
  ArrowUpRight
} from 'lucide-react';
import { useAuth, CustomHeaderButton } from '@/context/AuthContext';
import { useTenant } from '@/context/TenantContext';
import { safeStorage } from '@/lib/safeStorage';

export function ConfigurableHeaderButtons() {
  const { systemConfig } = useAuth();
  const { subdomain } = useTenant();

  const buttons = useMemo<CustomHeaderButton[]>(() => {
    // 1. Tenta carregar do systemConfig (Firestore / tempo real sincronizado)
    if (systemConfig?.botoesCabecalho && Array.isArray(systemConfig.botoesCabecalho) && systemConfig.botoesCabecalho.length > 0) {
      return systemConfig.botoesCabecalho;
    }

    // 2. Fallback local por tenant
    const stored = safeStorage.getItem(`adti_custom_buttons_${subdomain || 'default'}`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch {}
    }

    return [];
  }, [systemConfig?.botoesCabecalho, subdomain]);

  if (!buttons || buttons.length === 0) {
    return null;
  }

  // Render Icon helper
  const renderIcon = (iconType?: string, className: string = 'w-4 h-4') => {
    switch (iconType) {
      case 'user':
        return <UserPlus className={className} />;
      case 'chat':
        return <MessageCircle className={className} />;
      case 'file':
        return <FileText className={className} />;
      case 'globe':
        return <Globe className={className} />;
      case 'star':
        return <Star className={className} />;
      case 'external':
        return <ExternalLink className={className} />;
      default:
        return <Link2 className={className} />;
    }
  };

  // Render button style helper
  const getVariantClasses = (varType?: string) => {
    switch (varType) {
      case 'secondary':
        return 'bg-secondary text-on-secondary hover:brightness-110 shadow-xs';
      case 'outline':
        return 'bg-surface hover:bg-surface-container border border-outline-variant text-on-surface';
      case 'surface':
        return 'bg-surface-container hover:bg-surface-container-high text-on-surface border border-outline-variant/50';
      case 'primary':
      default:
        return 'bg-primary text-on-primary hover:bg-secondary shadow-xs';
    }
  };

  return (
    <div className="flex items-center gap-1.5 md:gap-2">
      {buttons.map((btn) => {
        const isExternal =
          btn.url.startsWith('http://') ||
          btn.url.startsWith('https://') ||
          btn.url.startsWith('mailto:') ||
          btn.url.startsWith('tel:') ||
          btn.targetBlank;

        if (isExternal) {
          return (
            <a
              key={btn.id}
              href={btn.url}
              target={btn.targetBlank !== false ? '_blank' : '_self'}
              rel="noopener noreferrer"
              className={`hidden sm:inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-sm font-semibold transition-all cursor-pointer select-none ${getVariantClasses(
                btn.variant
              )}`}
              title={`${btn.label} (${btn.url})`}
            >
              {renderIcon(btn.icon)}
              <span>{btn.label}</span>
              {isExternal && <ArrowUpRight className="w-3 h-3 opacity-70" />}
            </a>
          );
        }

        return (
          <Link
            key={btn.id}
            href={btn.url}
            prefetch={true}
            className={`hidden sm:inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-sm font-semibold transition-all cursor-pointer select-none ${getVariantClasses(
              btn.variant
            )}`}
            title={`${btn.label} (${btn.url})`}
          >
            {renderIcon(btn.icon)}
            <span>{btn.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
