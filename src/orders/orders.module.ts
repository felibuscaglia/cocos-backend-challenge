import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstrumentsModule } from '../instruments/instruments.module';
import { UsersModule } from '../users/users.module';
import { Order } from './order.entity';
import { OrdersController } from './orders.controller';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order]),
    forwardRef(() => UsersModule),
    InstrumentsModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersRepository, OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
