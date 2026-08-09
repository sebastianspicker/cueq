import { URL } from 'node:url';

export function parseDatabaseUrl(databaseUrl) {
  const url = new URL(databaseUrl);
  const schema = url.searchParams.get('schema') ?? 'public';
  const pathname = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
  const database = pathname || 'postgres';
  const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';

  return {
    schema,
    database,
    port: url.port || '5432',
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    host: isLocalhost ? 'host.docker.internal' : url.hostname,
    needsHostGateway: isLocalhost,
  };
}

export function withDatabase(databaseUrl, database) {
  const url = new URL(databaseUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

export function withSchema(databaseUrl, schema) {
  const url = new URL(databaseUrl);
  url.searchParams.set('schema', schema);
  return url.toString();
}

export function createPgTools({ execFileSync, postgresClientImage }) {
  function runPgTool(args, connection, tempDir) {
    const dockerArgs = ['run', '--rm'];
    if (connection.needsHostGateway) {
      dockerArgs.push('--add-host', 'host.docker.internal:host-gateway');
    }
    dockerArgs.push(
      '-e',
      `PGPASSWORD=${connection.password}`,
      '-v',
      `${tempDir}:/backup`,
      postgresClientImage,
      ...args,
    );
    execFileSync('docker', dockerArgs, { stdio: 'pipe' });
  }

  function runPsql(connection, database, sql, tempDir) {
    runPgTool(
      [
        'psql',
        '-h',
        connection.host,
        '-p',
        connection.port,
        '-U',
        connection.user,
        '-d',
        database,
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        sql,
      ],
      connection,
      tempDir,
    );
  }

  function dumpSource(connection, tempDir, dumpPath) {
    runPgTool(
      [
        'pg_dump',
        '-h',
        connection.host,
        '-p',
        connection.port,
        '-U',
        connection.user,
        '-d',
        connection.database,
        '--schema',
        connection.schema,
        '--format=custom',
        '--no-owner',
        '--no-privileges',
        '--file',
        dumpPath,
      ],
      connection,
      tempDir,
    );
  }

  function restoreDump(connection, database, tempDir, dumpPath) {
    runPgTool(
      [
        'pg_restore',
        '-h',
        connection.host,
        '-p',
        connection.port,
        '-U',
        connection.user,
        '-d',
        database,
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-privileges',
        dumpPath,
      ],
      connection,
      tempDir,
    );
  }

  return { runPgTool, runPsql, dumpSource, restoreDump };
}
