import { Injectable } from '@nestjs/common';
import { OrdersService } from '../orders/orders.service';

@Injectable()
export class UsersService {
  constructor(private readonly ordersService: OrdersService) {}
}
