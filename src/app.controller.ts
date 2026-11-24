import { Controller, Get, HttpStatus } from '@nestjs/common';

@Controller()
export class AppController {
  constructor() {}

  @Get()
  getInfo() {
    return {
      statusCode: HttpStatus.OK,
      name: 'Cocos Backend Challenge',
      description: 'API REST de portfolio, búsqueda de activos y órdenes.',
      author: 'Felipe Buscaglia',
    };
  }
}
