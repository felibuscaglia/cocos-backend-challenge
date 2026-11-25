import { Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators';
import { User } from '../users/user.entity';

@ApiTags('Órdenes')
@Controller('orders')
export class OrdersController {
  @Post()
  @ApiOperation({ summary: 'Enviar una orden' })
  create(@CurrentUser() user: User): User {
    return user;
  }
}
