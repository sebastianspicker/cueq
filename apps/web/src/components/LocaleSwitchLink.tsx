'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

interface LocaleSwitchLinkProps {
  locale: string;
  targetLocale: string;
  label: string;
}

export function LocaleSwitchLink({ locale, targetLocale, label }: LocaleSwitchLinkProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pathWithoutLocale = pathname.startsWith(`/${locale}`)
    ? pathname.slice(locale.length + 1)
    : pathname;
  const targetPath = `/${targetLocale}${pathWithoutLocale || '/dashboard'}`;
  const search = searchParams.toString();

  return (
    <Link className="cq-locale-switch" href={search ? `${targetPath}?${search}` : targetPath}>
      {label}
    </Link>
  );
}
