import { useEffect, useState } from 'react';

/**
 * Logo de la empresa. Si la empresa cargó uno (Ajustes), muestra /api/logo;
 * si no, cae al logo por defecto del proyecto (SVG con rayo).
 */
export function CompanyLogo({ className = '' }: { className?: string }) {
  const [src, setSrc] = useState(`/api/logo?v=${Date.now()}`);
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    const onLogoChange = () => {
      setBroken(false);
      setSrc(`/api/logo?v=${Date.now()}`);
    };
    window.addEventListener('logochange', onLogoChange);
    return () => window.removeEventListener('logochange', onLogoChange);
  }, []);
  return (
    <img
      className={className}
      src={broken ? '/logo-default.svg' : src}
      alt="Logo"
      onError={() => setBroken(true)}
    />
  );
}