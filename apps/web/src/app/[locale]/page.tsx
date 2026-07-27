/** Locale index route that forwards users to the localized dashboard. */
import { redirect } from 'next/navigation';

interface LocalePageProps {
  params: Promise<{ locale: string }>;
}

/** Validates the locale segment before redirecting into the workspace. */
export default async function LocaleIndexPage({ params }: LocalePageProps) {
  const { locale } = await params;
  redirect(`/${locale}/dashboard`);
}
