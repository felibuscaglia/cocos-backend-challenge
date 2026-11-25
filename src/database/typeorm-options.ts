import { ConfigService } from '@nestjs/config';
import { extname, join } from 'node:path';
import { DataSourceOptions } from 'typeorm';
import { Instrument } from '../instruments/instrument.entity';
import { MarketData } from '../market-data/market-data.entity';
import { Order } from '../orders/order.entity';
import { User } from '../users/user.entity';

// Compartido entre la app y la CLI de TypeORM.
export const typeOrmOptions = (config: ConfigService): DataSourceOptions => ({
  type: 'postgres',
  url: config.getOrThrow<string>('DATABASE_URL'),
  synchronize: false,
  entities: [User, Instrument, Order, MarketData],
  // Misma extensión que este archivo: .js desde dist/ y .ts en los tests e2e (Jest corre src/).
  // Un glob *.{ts,js} tomaría también los .d.ts de dist/.
  migrations: [join(__dirname, 'migrations', `*${extname(__filename)}`)],
});
