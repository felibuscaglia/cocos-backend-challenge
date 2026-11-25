import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators';
import { User } from './user.entity';

@ApiTags('Portfolio')
@Controller()
export class UsersController {
  @Get('portfolio')
  @ApiOperation({ summary: 'Portfolio del usuario' })
  getPortfolio(@CurrentUser() user: User): User {
    return user;
  }
}
