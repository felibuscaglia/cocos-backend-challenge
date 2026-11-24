import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('General')
@Controller()
export class AppController {
  constructor() {}

  @Get()
  @ApiOperation({ summary: 'Información básica de la API' })
  @ApiOkResponse({
    description: 'Nombre, descripción y autor de la API.',
  })
  getInfo() {
    return {
      statusCode: HttpStatus.OK,
      name: 'Cocos Backend Challenge',
      description: 'API REST de portfolio, búsqueda de activos y órdenes.',
      author: 'Felipe Buscaglia',
    };
  }
}
