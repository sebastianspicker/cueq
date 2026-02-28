import { getRequestConfig } from 'next-intl/server';

const supportedLocales = ['de', 'en'] as const;

type SupportedLocale = (typeof supportedLocales)[number];

function isSupportedLocale(value: string): value is SupportedLocale {
  return supportedLocales.includes(value as SupportedLocale);
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale: SupportedLocale = requested && isSupportedLocale(requested) ? requested : 'de';

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
