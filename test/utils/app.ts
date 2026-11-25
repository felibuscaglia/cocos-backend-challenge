import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { initializeTransactionalContext } from 'typeorm-transactional';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';

export async function createTestApp(): Promise<{
  app: INestApplication;
  dataSource: DataSource;
}> {
  initializeTransactionalContext();

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  // Escucha en un puerto real: supertest no puede abrir el mismo servidor dos veces
  // cuando se envían pedidos simultáneos.
  await app.listen(0);

  return { app, dataSource: app.get(DataSource) };
}
