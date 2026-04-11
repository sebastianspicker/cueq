import { DEFAULT_DATABASE_URL, prismaPushReset, withSchema } from './db-utils';

let initialized = false;

export function configureSuiteDatabase(schema: string) {
  if (initialized) {
    return;
  }
  const suiteDatabaseUrl = withSchema(process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL, schema);

  process.env.DATABASE_URL = suiteDatabaseUrl;

  prismaPushReset(suiteDatabaseUrl);

  initialized = true;
}
