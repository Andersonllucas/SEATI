'use client';

import React, { useState, useEffect } from 'react';
import { Vote } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTenant } from '@/context/TenantContext';

export interface BrandLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'custom';
  className?: string;
  imageClassName?: string;
  fallbackIconClassName?: string;
  customSrc?: string | null;
  alt?: string;
  showFallbackBadge?: boolean;
}

const SIZE_CONFIGS = {
  xs: {
    container: 'w-6 h-6 rounded-md',
    icon: 'w-3.5 h-3.5',
    img: 'w-6 h-6 rounded-md'
  },
  sm: {
    container: 'w-10 h-10 rounded-xl',
    icon: 'w-5 h-5',
    img: 'w-10 h-10 rounded-xl'
  },
  md: {
    container: 'w-12 h-12 rounded-xl',
    icon: 'w-6 h-6',
    img: 'w-12 h-12 rounded-xl'
  },
  lg: {
    container: 'w-16 h-16 rounded-2xl',
    icon: 'w-9 h-9',
    img: 'w-16 h-16 rounded-2xl'
  },
  xl: {
    container: 'w-24 h-24 rounded-3xl',
    icon: 'w-12 h-12',
    img: 'w-24 h-24 rounded-3xl'
  },
  custom: {
    container: '',
    icon: 'w-full h-full',
    img: 'w-full h-full'
  }
};

export function BrandLogo({
  size = 'md',
  className = '',
  imageClassName = '',
  fallbackIconClassName = '',
  customSrc,
  alt,
  showFallbackBadge = true
}: BrandLogoProps) {
  const { systemConfig } = useAuth();
  const { currentTenant } = useTenant();

  // Resolution order:
  // 1. Explicit prop customSrc (if passed)
  // 2. systemConfig.logoUrl (saved in tenant firestore settings)
  // 3. currentTenant.logoUrl (multi-tenant registry config)
  // 4. Default public file /logo.svg
  const configuredSrc =
    customSrc !== undefined
      ? customSrc
      : (systemConfig?.logoUrl?.trim() || currentTenant?.logoUrl?.trim() || '/logo.svg');

  const [hasError, setHasError] = useState(false);
  const [currentSrc, setCurrentSrc] = useState<string | null>(configuredSrc || null);

  useEffect(() => {
    setHasError(false);
    setCurrentSrc(configuredSrc || null);
  }, [configuredSrc]);

  const sizeStyle = SIZE_CONFIGS[size] || SIZE_CONFIGS.md;
  const brandAlt = alt || systemConfig?.nomeCampanha || currentTenant?.nome || 'SEATI Gestão Eleitoral';

  // Fallback badge with Vote icon
  const renderFallbackIcon = () => (
    <div
      className={`inline-flex items-center justify-center bg-gradient-to-tr from-blue-700 via-blue-600 to-indigo-600 text-white shadow-md border border-white/20 select-none overflow-hidden ${
        sizeStyle.container
      } ${className}`}
      title={brandAlt}
    >
      <Vote className={`${sizeStyle.icon} ${fallbackIconClassName} pointer-events-none text-white`} />
    </div>
  );

  // If no source provided or failed to load image, render fallback
  if (!currentSrc || hasError) {
    if (!showFallbackBadge) return null;
    return renderFallbackIcon();
  }

  return (
    <div
      className={`relative inline-flex items-center justify-center overflow-hidden shrink-0 select-none ${
        sizeStyle.container
      } ${className}`}
    >
      <img
        src={currentSrc}
        alt={brandAlt}
        onError={() => {
          // If custom URL or /logo.svg failed, try /logo.png once before showing fallback
          if (currentSrc === '/logo.svg') {
            setCurrentSrc('/logo.png');
          } else if (currentSrc !== '/logo.svg' && currentSrc !== '/logo.png') {
            setCurrentSrc('/logo.svg');
          } else {
            setHasError(true);
          }
        }}
        className={`object-contain w-full h-full pointer-events-none drop-shadow-sm ${
          sizeStyle.img
        } ${imageClassName}`}
        loading="eager"
      />
    </div>
  );
}
