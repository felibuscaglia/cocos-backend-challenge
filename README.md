# Cocos Backend Challenge

API REST de un broker, hecha con NestJS 11, TypeORM y PostgreSQL 18. Permite:

- Consultar el **portfolio** de un usuario: valor total, efectivo y posiciones.
- **Buscar activos** por ticker o nombre.
- **Enviar y cancelar órdenes**: MARKET, LIMIT, CASH_IN y CASH_OUT.

Las decisiones de diseño, con su porqué, en [`docs/decisiones/`](docs/decisiones/).

## Setup y ejecución

### Requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/), abierto.
- Node 24 y npm, solo para correr los tests.

### Ejecución

Docker Compose levanta varios contenedores definidos en un archivo (`docker-compose.yml`). Acá son dos: la base Postgres (`db`), que se carga con [`src/database/seed.sql`](src/database/seed.sql), y la API (`api`).

```bash
docker compose up
```

La API queda en `http://localhost:3000`, con las migraciones aplicadas. No hace falta crear `.env`.

Para volver la base al estado del seed:

```bash
docker compose down -v   # -v borra el volumen con los datos
docker compose up
```

### Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DATABASE_URL` | Sí | URL de Postgres. Las opciones de conexión van en la URL (ej. `?sslmode=require`). |
| `RUN_MIGRATIONS` | Sí | `true` aplica las migraciones pendientes al iniciar; `false` no toca el esquema. |
| `PORT` | No | Puerto de la API. Por defecto `3000`. |

Si falta una variable obligatoria o tiene un valor inválido, la app no inicia y el error dice cuál es.

### Usar otra base (ej. Neon)

Poner su URL en `DATABASE_URL` dentro de `.env` (nunca commitearla). Docker Compose la toma de ahí.

`RUN_MIGRATIONS` decide si se modifica esa base: con `true`, al iniciar se le aplican las migraciones (restricciones, índices, la extensión `unaccent` y una función SQL).

### Tests

```bash
npm install
npm run test:e2e
```

Requieren Docker abierto. Levantan su propio Postgres descartable ([Testcontainers](https://testcontainers.com/)), así que no usan `.env` ni tocan ninguna otra base.

### Documentación de la API

Swagger UI en `http://localhost:3000/docs`, con todos los endpoints, ejemplos y errores.

La colección de Postman está en [`docs/postman/cocos-backend-challenge.postman_collection.json`](docs/postman/cocos-backend-challenge.postman_collection.json). Usa las variables `baseUrl` y `userId` (el valor del header `X-User-Id`).

## Endpoints

| Endpoint | Header `X-User-Id` | Descripción |
|---|---|---|
| `GET /portfolio` | Sí | Valor total, efectivo disponible y reservado, y posiciones |
| `GET /instruments?q=&page=&limit=` | No | Búsqueda paginada por ticker o nombre, sin distinguir mayúsculas ni acentos |
| `POST /orders` | Sí | Envía una orden |
| `POST /orders/:orderId/cancel` | No | Cancela una orden en estado `NEW` |

No hay autenticación: el usuario se identifica con el header `X-User-Id`. Si falta o el usuario no existe, la respuesta es 404.

## Arquitectura

### Componentes

| Módulo / pieza | Responsabilidad |
|---|---|
| `users` | `GET /portfolio`: combina saldos y posiciones |
| `instruments` | `GET /instruments`: búsqueda con ranking y paginación |
| `orders` | Envío y cancelación de órdenes, cálculo de saldos |
| `common` | `UserGuard` (header `X-User-Id`), filtro global de errores, DTOs compartidos |
| `database` | Configuración de TypeORM, migraciones y seed |

Cada módulo separa el controlador (HTTP y Swagger), el servicio (reglas de negocio) y el repositorio (consultas SQL).

### Flujo de una orden (`POST /orders`)

1. **Usuario:** `UserGuard` lo busca por `X-User-Id` → 404 si no existe.
2. **Body:** el DTO valida campos, tipos y combinaciones → 400.
3. **Instrumento:** se busca por ticker exacto → 404. BUY/SELL sobre ARS, o CASH_IN/CASH_OUT sobre otro ticker → 400.
4. **Bloqueo:** se abre una transacción y se bloquea la fila del usuario (`SELECT ... FOR UPDATE`).
5. **Precio y cantidad:** MARKET usa el último `close`; LIMIT, el precio límite; las transferencias, precio `1`. Con `amount`, `size = floor(amount ÷ precio)`.
6. **Reglas de negocio**, en orden de prioridad: `NO_MARKET_DATA` → `AMOUNT_TOO_LOW` → `INSUFFICIENT_FUNDS` / `INSUFFICIENT_SHARES`.
7. **Guardado:** la orden se guarda siempre, como `FILLED` (MARKET y transferencias), `NEW` (LIMIT) o `REJECTED`.
8. **Respuesta:** 201 con la orden y, si fue rechazada, `rejection: { code, message }`.

Los errores 4xx no guardan nada. Los rechazos de negocio responden 201 porque la orden sí se crea.

### Esquema de datos y migraciones

`src/database/seed.sql` (el esquema y los datos de la consigna) no se modifica. Los cambios van en migraciones de TypeORM encima, y `synchronize` está desactivado.

| Migración | Qué agrega |
|---|---|
| `ColumnConstraints` | NOT NULL en las columnas obligatorias y CHECK con los valores permitidos de `side`, `type` y `status` |
| `UniqueConstraintsAndIndexes` | Ticker único, un precio por instrumento y día, e índice `orders (userid, status, instrumentid)` |
| `UnaccentExtension` | Extensión `unaccent`, para buscar sin acentos |
| `UserPositionsFunction` | Función `user_positions(user_id)`, que calcula las posiciones de un usuario |

### Saldos y PPC

Se calculan a partir de la tabla `orders`. Las sumas se hacen en Postgres con `NUMERIC`, y se combinan en el servicio con `decimal.js` para no perder precisión.

- **Efectivo total:** CASH_IN − CASH_OUT − BUY + SELL de las órdenes `FILLED` (cada una `size × price`).
- **Efectivo reservado:** BUY en estado `NEW`. **Disponible** = total − reservado.
- **Acciones disponibles:** compradas − vendidas − SELL en estado `NEW`.
- **Valor total:** disponible + reservado + valor de mercado de las posiciones.

La función `user_positions` recorre las compras y ventas `FILLED` de cada instrumento en orden cronológico y calcula el **PPC** (precio promedio de compra):

- **Compra:** PPC = (tenencia × PPC + cantidad × precio) ÷ (tenencia + cantidad). Si la tenencia era 0 o menos, el PPC pasa a ser el precio de la compra.
- **Venta:** baja la tenencia; el PPC no cambia.

El rendimiento es `(último precio − PPC) ÷ PPC`, como fracción (`0.2` = 20%). Los montos se devuelven como strings decimales (`"925.85"`) para no perder precisión.

### Formato de errores

Todos los errores tienen la misma forma:

```json
{
  "statusCode": 404,
  "message": "Usuario no encontrado",
  "error": "Not Found",
  "path": "/portfolio",
  "timestamp": "2026-11-23T14:00:00.000Z"
}
```

`message` está en español (una lista en los errores de validación). Los errores de Postgres conocidos se traducen a 400, 404 o 409; el resto responde 500 sin detalles internos y queda en el log.

### Concurrencia

Cada orden corre en una transacción que primero bloquea la fila del usuario. Si llegan dos órdenes simultáneas del mismo usuario, la segunda espera a que termine la primera y valida contra el saldo ya actualizado: no se puede gastar dos veces el mismo dinero ni vender dos veces las mismas acciones. Las órdenes de usuarios distintos no se bloquean entre sí.

La cancelación es un solo `UPDATE ... WHERE status = 'NEW'`: si llegan dos a la vez, una responde 200 y la otra 409.
