import { INestApplication, ValidationPipe } from '@nestjs/common';

// Compartido con los tests e2e, para que la app de test se comporte igual que la real.
export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
