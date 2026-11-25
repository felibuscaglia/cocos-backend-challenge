import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators';
import { PortfolioDto } from './dto';
import { User } from './user.entity';
import { UsersService } from './users.service';

@ApiTags('Portfolio')
@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('portfolio')
  @ApiOperation({ summary: 'Portfolio del usuario' })
  @ApiOkResponse({
    description:
      'Valor total de la cuenta, efectivo disponible y reservado, y posiciones por activo.',
    type: PortfolioDto,
    example: {
      totalValue: '889756',
      availableCash: '627500',
      reservedCash: '125500',
      positions: [
        {
          ticker: 'METR',
          name: 'MetroGAS S.A.',
          quantity: 500,
          latestPrice: '229.5',
          marketValue: '114750',
          totalReturn: -0.082,
        },
      ],
    },
  })
  getPortfolio(@CurrentUser() user: User): Promise<PortfolioDto> {
    return this.usersService.getPortfolio(user.id);
  }
}
