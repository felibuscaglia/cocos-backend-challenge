import { ConfigService } from '@nestjs/config';
import { DataSourceOptions } from 'typeorm';
import { Instrument } from '../instruments/instrument.entity';
import { MarketData } from '../market-data/market-data.entity';
import { Order } from '../orders/order.entity';
import { User } from '../users/user.entity';

// Compartido entre la app y la CLI de TypeORM. Las migraciones se leen siempre
// compiladas desde dist/, por eso los scripts de migraciones compilan antes.
export const typeOrmOptions = (config: ConfigService): DataSourceOptions => ({
  type: 'postgres',
  url: config.getOrThrow<string>('DATABASE_URL'),
  synchronize: false,
  entities: [User, Instrument, Order, MarketData],
  migrations: ['dist/database/migrations/*.js'],
});
