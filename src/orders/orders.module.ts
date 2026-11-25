import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { OrdersController } from './orders.controller';

@Module({
  imports: [UsersModule],
  controllers: [OrdersController],
})
export class OrdersModule {}
