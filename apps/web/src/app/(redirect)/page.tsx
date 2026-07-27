/** Server redirect that preserves a valid locale preference before entering the workspace. */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

/** Resolves the preferred locale and redirects to its dashboard. */
export default async function Home() {
  const cookieStore = await cookies();
  const locale = cookieStore.get('NEXT_LOCALE')?.value === 'en' ? 'en' : 'de';
  redirect(`/${locale}/dashboard`);
}
