# Decisiones — Infraestructura

## Docker Compose con dos servicios

**Decisión:** el proyecto se levanta con Docker Compose y dos servicios:
- `db`: imagen oficial `postgres:18`, la misma versión que la base hosteada provista. Carga `src/database/seed.sql` la primera vez que se inicializa.
- `api`: la app NestJS, construida desde el `Dockerfile`.

**Por qué:** cualquier persona con Docker levanta la API y una base con los datos del challenge con un solo comando (`docker compose up`). No necesita instalar Node ni Postgres, ni depende de credenciales externas. Fijar Postgres 18 evita diferencias de comportamiento con la base hosteada.

**Alternativas descartadas:**
- Solo la base en Docker y la app con npm: obliga a tener Node instalado para probar el proyecto.
- Solo la app en Docker, siempre conectada a la base hosteada: todos usarían una misma base viva cuyo estado cambia, haría falta compartir credenciales y los tests escribirían en ella.

## Base de datos configurable con `DATABASE_URL`

**Decisión:** la app se conecta a la base Postgres que indique `DATABASE_URL`. Por defecto es la del servicio `db`. Para usar cualquier otra (por ejemplo, la base hosteada provista por Cocos) alcanza con cambiar la variable en `.env`.

**Por qué:** el mismo código funciona en desarrollo local, en Docker y contra cualquier base externa, sin cambios. Las opciones de conexión, como SSL, viajan en la propia URL (`sslmode=require`).

## Migraciones al iniciar, controladas por `RUN_MIGRATIONS`

**Decisión:** la app aplica las migraciones pendientes al iniciar solo si `RUN_MIGRATIONS=true` (`migrationsRun` de TypeORM). La variable es obligatoria y no tiene valor por defecto: si falta, la app no inicia.
- `.env.example` y Docker Compose la definen en `true`, para que la base local quede actualizada sin pasos extra.
- Con `false`, la app se conecta sin modificar el esquema.

**Por qué:** no está confirmado si se pueden aplicar migraciones sobre la base de Neon que compartió Cocos. Si la app las aplicara siempre, apuntar `DATABASE_URL` a Neon cambiaría su esquema (restricciones, índices, la extensión `unaccent` y una función SQL) sin pedir permiso. Al ser obligatoria, la variable fuerza a decidir de forma explícita en cada entorno si se migra o no.

**Alternativas descartadas:**
- Migrar siempre al iniciar (`migrationsRun: true`): es lo más simple, pero basta un error en `DATABASE_URL` para modificar una base ajena.
- Valor por defecto `true`: olvidarse la variable al apuntar a Neon aplicaría las migraciones.
- Valor por defecto `false`: más seguro, pero si se olvida la variable en local la base queda sin migrar y los errores aparecen recién al usar la API.
- Correrlas siempre a mano con `npm run migration:run`: da control, pero agrega un paso fácil de olvidar en local.
