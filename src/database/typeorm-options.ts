import { ConfigService } from '@nestjs/config';
import { DataSourceOptions } from 'typeorm';

// Compartido entre la app y la CLI de TypeORM. Las migraciones se leen siempre
// compiladas desde dist/, por eso los scripts de migraciones compilan antes.
export const typeOrmOptions = (config: ConfigService): DataSourceOptions => ({
  type: 'postgres',
  url: config.getOrThrow<string>('DATABASE_URL'),
  synchronize: false,
  migrations: ['dist/database/migrations/*.js'],
});
