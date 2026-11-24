# Decisiones — Infraestructura

## Docker Compose con dos servicios

**Decisión:** el proyecto se levanta con Docker Compose y dos servicios:
- `db`: imagen oficial `postgres:18`, la misma versión que la base hosteada provista. Carga `database.sql` la primera vez que se inicializa.
- `api`: la app NestJS, construida desde el `Dockerfile`.

**Por qué:** cualquier persona con Docker levanta la API y una base con los datos del challenge con un solo comando (`docker compose up`). No necesita instalar Node ni Postgres, ni depende de credenciales externas. Fijar Postgres 18 evita diferencias de comportamiento con la base hosteada.

**Alternativas descartadas:**
- Solo la base en Docker y la app con npm: obliga a tener Node instalado para probar el proyecto.
- Solo la app en Docker, siempre conectada a la base hosteada: todos usarían una misma base viva cuyo estado cambia, haría falta compartir credenciales y los tests escribirían en ella.

## Base de datos configurable con `DATABASE_URL`

**Decisión:** la app se conecta a la base Postgres que indique `DATABASE_URL`. Por defecto es la del servicio `db`. Para usar cualquier otra (por ejemplo, la base hosteada provista por Cocos) alcanza con cambiar la variable en `.env`.

**Por qué:** el mismo código funciona en desarrollo local, en Docker y contra cualquier base externa, sin cambios. Las opciones de conexión, como SSL, viajan en la propia URL (`sslmode=require`).

## Migraciones automáticas al iniciar

**Decisión:** la app aplica las migraciones pendientes cada vez que inicia (`migrationsRun: true`).

**Por qué:** con `docker compose up` el esquema queda actualizado sin pasos adicionales. Como consecuencia, al apuntar `DATABASE_URL` a otra base, las migraciones se aplican sobre esa base al iniciar.

**Alternativas descartadas:** correrlas a mano con `npm run migration:run`. Da más control, pero agrega un paso que es fácil olvidar.
