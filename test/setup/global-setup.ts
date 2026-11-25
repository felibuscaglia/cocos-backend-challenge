import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

let container: StartedPostgreSqlContainer | undefined;

export async function setup(): Promise<void> {
  try {
    container = await new PostgreSqlContainer('postgres:18').start();
  } catch (error) {
    throw new Error(
      `No se pudo iniciar el contenedor de Postgres. Los tests e2e requieren Docker abierto.\n${String(error)}`,
    );
  }

  const client = new Client({ connectionString: container.getConnectionUri() });
  await client.connect();
  await client.query(
    readFileSync(
      join(__dirname, '..', '..', 'src', 'database', 'seed.sql'),
      'utf8',
    ),
  );
  await client.end();

  // Los workers de los tests heredan process.env. Estas variables reemplazan las de un
  // .env local, así que los tests nunca tocan la base de Docker Compose ni Neon.
  process.env.DATABASE_URL = container.getConnectionUri();
  process.env.RUN_MIGRATIONS = 'true';
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
