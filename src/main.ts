import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { initializeTransactionalContext } from 'typeorm-transactional';

async function bootstrap() {
  // Debe correr antes de crear la app: parchea los repositorios de TypeORM para que
  // usen la transacción en curso sin pasarles el EntityManager.
  initializeTransactionalContext();

  const app = await NestFactory.create(AppModule);

  configureApp(app);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Cocos Backend Challenge')
    .setDescription(
      'API REST para consultar el portfolio, buscar activos y enviar o cancelar órdenes.',
    )
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('/docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
