import React, { useEffect, useState } from 'react';

const PRIMARY_LOGO_SRC = '/cicr-logo.jpg';
const FALLBACK_LOGO_SRC = '/logo.png';

let cachedLogoObjectUrl: string | null = null;
let inflightPreload: Promise<string | null> | null = null;

/**
 * Eagerly caches the brand emblem into an in-memory object URL so dynamically mounted
 * containers (such as the mobile drawer) render immediately without failing on transient reconnects.
 */
function preloadCicrLogoAsset(): Promise<string | null> {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') {
    return Promise.resolve(null);
  }
  if (cachedLogoObjectUrl) {
    return Promise.resolve(cachedLogoObjectUrl);
  }
  if (inflightPreload) {
    return inflightPreload;
  }

  inflightPreload = (async () => {
    for (const candidate of [PRIMARY_LOGO_SRC, FALLBACK_LOGO_SRC]) {
      try {
        const res = await fetch(candidate, { cache: 'force-cache' });
        if (!res.ok) continue;
        const blob = await res.blob();
        if (blob.size > 0 && typeof URL?.createObjectURL === 'function') {
          cachedLogoObjectUrl = URL.createObjectURL(blob);
          return cachedLogoObjectUrl;
        }
      } catch {
        // Ignore transient network errors and try next fallback asset
      }
    }
    return null;
  })().finally(() => {
    inflightPreload = null;
  });

  return inflightPreload;
}

if (typeof window !== 'undefined') {
  void preloadCicrLogoAsset();
}

/**
 * Renders the circular/rounded CICR emblem with automatic in-memory caching,
 * static image fallback, and a clean monogram badge if image assets fail offline.
 */
export const CicrLogo: React.FC<{ size?: number; className?: string }> = ({
  size = 56,
  className = '',
}) => {
  const [src, setSrc] = useState<string>(() => cachedLogoObjectUrl || PRIMARY_LOGO_SRC);
  const [fallbackTier, setFallbackTier] = useState<0 | 1 | 2>(0);

  useEffect(() => {
    let active = true;
    void preloadCicrLogoAsset().then((resolved) => {
      if (!active || !resolved) return;
      setSrc((prev) => (prev === resolved ? prev : resolved));
      setFallbackTier(0);
    });
    return () => {
      active = false;
    };
  }, []);

  const handleImageError = () => {
    if (fallbackTier === 0) {
      if (cachedLogoObjectUrl && src !== cachedLogoObjectUrl) {
        setSrc(cachedLogoObjectUrl);
      } else {
        setFallbackTier(1);
        setSrc(FALLBACK_LOGO_SRC);
      }
      return;
    }
    if (fallbackTier === 1) {
      setFallbackTier(2);
    }
  };

  return (
    <div
      className={`relative inline-flex items-center justify-center rounded-2xl bg-white dark:bg-black border-2 border-slate-200 dark:border-slate-800 shadow-md p-1.5 overflow-hidden group ${className}`}
      style={{ width: size, height: size }}
    >
      {fallbackTier < 2 ? (
        <img
          src={src}
          alt="CICR Inventory Logo"
          decoding="async"
          onError={handleImageError}
          className="w-full h-full object-contain filter contrast-125"
        />
      ) : (
        <span
          aria-label="CICR Inventory Logo"
          className="text-[10px] font-black tracking-tighter text-slate-900 dark:text-white select-none"
        >
          CICR
        </span>
      )}
    </div>
  );
};
