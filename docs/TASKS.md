# Plan de trabajo — Cocos Backend Challenge

Lista de tareas para completar el challenge de punta a punta. Cada tarea equivale a **un commit** directo a `main`. Dentro de cada tarea, las subtareas y los criterios de aceptación son checklists a verificar antes de commitear.

> Los valores numéricos se escriben como en JSON (punto decimal, sin separador de miles): `753000`, `925.85`.

---

## Convenciones

- **Idioma:** el código va en inglés. README, documentación, mensajes de commit, descripciones de Swagger, mensajes de error y de rechazo, y descripciones de Postman van en español.
- **Commits:** un commit por tarea, directo a `main`. Las tareas marcadas *(sin commit)* no generan cambios en el repo.
- **Credenciales:** la URL de la base hosteada (Neon) incluye la contraseña y el repositorio es público. Solo puede estar en `.env` (ignorado por git). Nunca en código, documentación, `.env.example`, colecciones ni mensajes de commit.
- **Base de datos:** `database.sql` es la base del esquema y de los datos. Todo cambio se hace con migraciones de TypeORM encima.
- **Fuera de alcance por ahora:** CI, claves de idempotencia, simulación de mercado, ejecución automática de órdenes LIMIT, manejo de zonas horarias, comisiones y horarios de mercado.

---

## Reglas de negocio de referencia

### Glosario

- **Posición:** cantidad de acciones de un activo que tiene un usuario.
- **Orden en espera (NEW):** orden LIMIT aceptada que todavía no se ejecutó. En este proyecto nunca se ejecuta sola: solo puede cancelarse.
- **Efectivo reservado:** pesos apartados por órdenes BUY en espera. Siguen siendo del usuario, pero no puede usarlos para otra cosa.
- **PPC (precio promedio de compra):** costo promedio por acción de una posición.

### Fórmulas

Salvo aclaración, se usan solo órdenes `FILLED`. Todo el cálculo se hace en Postgres con `NUMERIC`. En las órdenes de efectivo `price = 1`, así que `size × price = size`.

| Concepto | Cálculo |
|---|---|
| Efectivo total | Σ CASH_IN − Σ CASH_OUT − Σ BUY + Σ SELL (cada término es `size × price`) |
| `reservedCash` | Σ `size × price` de las órdenes BUY en estado `NEW` |
| `availableCash` | Efectivo total − `reservedCash` |
| Cantidad de una posición | Σ `size` de BUY − Σ `size` de SELL del instrumento |
| Acciones disponibles para vender | Cantidad − Σ `size` de las SELL en estado `NEW` del instrumento |
| Último precio (`latestPrice`) | `close` de la fila de `marketdata` con la `date` más reciente del instrumento |
| `marketValue` | Cantidad × último precio |
| PPC | Ver el algoritmo más abajo |
| `totalReturn` | (último precio − PPC) ÷ PPC, como fracción (`0.28` = 28%) |
| `totalValue` | `availableCash` + `reservedCash` + Σ `marketValue` |
| `latestPrice` (búsqueda) | Último `close`. `null` si el instrumento no es de tipo `ACCIONES` o no tiene datos de mercado |
| `dailyReturn` (búsqueda) | (`close` − `previousClose`) ÷ `previousClose` del último día. `null` si el instrumento no es de tipo `ACCIONES` o no tiene datos de mercado |

### Algoritmo del PPC (promedio ponderado)

Recorrer las órdenes `FILLED` BUY y SELL del usuario para ese instrumento, de la más vieja a la más nueva (por `datetime` y, ante empate, por `id`):

1. **BUY:** si la cantidad en tenencia es ≤ 0, el PPC pasa a ser el precio de esa compra. Si no, PPC = (cantidad × PPC + `size` × `price`) ÷ (cantidad + `size`). Después, cantidad += `size`.
2. **SELL:** cantidad −= `size`. El PPC no cambia.

Ejemplo: compra 10 a 100 → PPC 100. Venta de 5 → PPC 100 (quedan 5). Compra 5 a 200 → PPC = (5 × 100 + 5 × 200) ÷ 10 = 150. Con último precio 180, `totalReturn` = (180 − 150) ÷ 150 = `0.2`.

### Ciclo de vida de una orden

| Orden | Resultados posibles |
|---|---|
| MARKET (BUY/SELL) | `FILLED` al último `close`, o `REJECTED` |
| LIMIT (BUY/SELL) | `NEW` al precio límite enviado (aunque el mercado esté mejor), o `REJECTED` |
| CASH_IN | `FILLED` |
| CASH_OUT | `FILLED` o `REJECTED` |
| Cancelación | Solo `NEW` → `CANCELLED`. Libera el efectivo o las acciones reservadas |

### Códigos de rechazo

No se guardan en la base: se devuelven en la respuesta como `rejection: { code, message }`. El mensaje sale de un mapa código → mensaje en la app. Si una orden incumple más de una regla, se informa el código de mayor prioridad.

| Prioridad | Código | Cuándo | Mensaje sugerido |
|---|---|---|---|
| 1 | `NO_MARKET_DATA` | El instrumento no tiene datos de mercado (PGR, IRCP), en MARKET o LIMIT | "El instrumento no tiene datos de mercado" |
| 2 | `AMOUNT_TOO_LOW` | El monto en pesos no alcanza para una acción entera | "El monto no alcanza para operar una acción" |
| 3 | `INSUFFICIENT_FUNDS` | BUY o CASH_OUT por más que `availableCash` | "Fondos insuficientes para ejecutar la orden" |
| 3 | `INSUFFICIENT_SHARES` | SELL por más que las acciones disponibles | "Acciones insuficientes para ejecutar la orden" |

### Qué se guarda en `orders`

| Caso | `size` | `price` |
|---|---|---|
| MARKET BUY/SELL | El enviado, o `floor(amount ÷ close)` | Último `close` |
| LIMIT BUY/SELL | El enviado, o `floor(amount ÷ precio límite)` | Precio límite |
| CASH_IN / CASH_OUT | `amount` | `1` |
| `REJECTED` por `AMOUNT_TOO_LOW` | `0` | Precio usado para el cálculo |
| `REJECTED` por `NO_MARKET_DATA` en MARKET | El enviado, o `0` si se envió `amount` | `0` |
| `REJECTED` por `NO_MARKET_DATA` en LIMIT | El enviado, o `floor(amount ÷ precio límite)` | Precio límite |

- Las órdenes de efectivo se guardan con instrumento ARS y `type` `MARKET`.
- `datetime` siempre lo asigna Postgres (`now()`), nunca el cliente ni Node.

### Orden de validación de `POST /orders`

1. Header `X-User-Id` ausente, no numérico o de un usuario inexistente → **404**.
2. Formato del body (campos, tipos, valores permitidos, combinaciones) → **400**.
3. `ticker` inexistente (comparación exacta, distingue mayúsculas) → **404**.
4. Reglas que dependen del instrumento (BUY/SELL sobre un instrumento `MONEDA`, CASH_IN/CASH_OUT sobre un ticker distinto de ARS) → **400**.
5. Reglas de negocio → **201** con `status: "REJECTED"` y el código correspondiente.

### Formato de respuesta de una orden

```json
{
  "id": 12,
  "ticker": "PAMP",
  "side": "BUY",
  "type": "MARKET",
  "size": 10,
  "price": 925.85,
  "status": "FILLED",
  "datetime": "2026-11-23T14:00:00.000Z",
  "rejection": null
}
```

En una orden rechazada, `rejection` vale `{ "code": "INSUFFICIENT_FUNDS", "message": "Fondos insuficientes para ejecutar la orden" }`. La respuesta nunca incluye `userId` ni el id interno del instrumento.

### Datos del seed para verificar

**Usuario 1:**

| Concepto | Valor esperado |
|---|---|
| Efectivo total | `753000` |
| `reservedCash` | `125500` (BUY NEW: 50 LOMA a 710 + 60 BMA a 1500) |
| `availableCash` | `627500` |
| PAMP | Cantidad `40` · último precio `925.85` · `marketValue` `37034` · PPC `930` · `totalReturn` ≈ `-0.0044624` |
| METR | Cantidad `500` · último precio `229.5` · `marketValue` `114750` · PPC `250` · `totalReturn` `-0.082` |
| BMA | Cantidad `-10` (anomalía del seed: vendió más de lo que compró) · último precio `1502.8` · `marketValue` `-15028` · PPC `1540` · `totalReturn` ≈ `-0.0241558` |
| `totalValue` | `889756` |

**Otros datos útiles:**

- Los usuarios 2, 3 y 4 no tienen órdenes: todos sus saldos son `0`.
- Instrumentos sin datos de mercado: PGR (id 3), IRCP (id 10) y ARS (id 66).
- Órdenes del seed por id: 1 CASH_IN, 2 BUY PAMP FILLED, 3 BUY PAMP CANCELLED, 4 SELL PAMP FILLED, 5 BUY LOMA NEW, 6 SELL PAMP REJECTED, 7 BUY BMA NEW, 8 CASH_OUT, 9 BUY BMA FILLED, 10 BUY METR FILLED, 11 SELL BMA FILLED. La primera orden nueva recibe el id 12.

---

## Índice

**Fase 0 — Preparación**
- [x] T0.1 — Consultar a Cocos sobre la base hosteada *(sin commit)*
- [x] T0.2 — Limpiar el scaffold de NestJS
- [x] T0.3 — Configuración y variables de entorno
- [x] T0.4 — Bootstrap HTTP: validación global y logger
- [ ] T0.5 — Documentación OpenAPI (Swagger) base

**Fase 1 — Docker**
- [ ] T1.1 — Dockerfile de la API
- [ ] T1.2 — Docker Compose (base de datos + API)

**Fase 2 — Acceso a datos con TypeORM**
- [ ] T2.1 — Conexión y configuración de migraciones
- [ ] T2.2 — Entidades

**Fase 3 — Migraciones de esquema**
- [ ] T3.1 — Restricciones NOT NULL y CHECK
- [ ] T3.2 — Unicidad e índices
- [ ] T3.3 — Extensión `unaccent`
- [ ] T3.4 — Función SQL de posiciones por usuario

**Fase 4 — Piezas transversales**
- [ ] T4.1 — Filtro global de excepciones
- [ ] T4.2 — Identificación del usuario por header `X-User-Id`

**Fase 5 — Saldos y portfolio**
- [ ] T5.1 — Cálculo de saldos del usuario
- [ ] T5.2 — Endpoint `GET /portfolio`

**Fase 6 — Búsqueda de activos**
- [ ] T6.1 — Endpoint `GET /instruments`

**Fase 7 — Órdenes**
- [ ] T7.1 — `POST /orders`: órdenes MARKET por cantidad
- [ ] T7.2 — Órdenes LIMIT
- [ ] T7.3 — Órdenes por monto en pesos
- [ ] T7.4 — Transferencias CASH_IN / CASH_OUT
- [ ] T7.5 — Control de concurrencia
- [ ] T7.6 — Cancelación de órdenes

**Fase 8 — Tests funcionales del envío de órdenes**
- [ ] T8.1 — Infraestructura de tests con Testcontainers
- [ ] T8.2 — Tests: órdenes ejecutadas y aceptadas
- [ ] T8.3 — Tests: órdenes rechazadas
- [ ] T8.4 — Tests: validaciones (400) y recursos inexistentes (404)
- [ ] T8.5 — Tests: concurrencia

**Fase 9 — Documentación y cierre**
- [ ] T9.1 — README
- [ ] T9.2 — Colección de Postman (recordatorio)
- [ ] T9.3 — Verificación contra Neon *(condicional)*
- [ ] T9.4 — Revisión final de la entrega

---

## Fase 0 — Preparación

### T0.1 — Consultar a Cocos sobre la base hosteada *(sin commit)*

**Objetivo:** saber si se pueden aplicar migraciones sobre la base de Neon provista sin afectar a otros candidatos.

**Subtareas**
- [x] Preguntar si la base es exclusiva y si se pueden aplicar migraciones: restricciones, índices, la extensión `unaccent` y una función SQL.
- [x] Guardar la respuesta para decidir T9.3.

**Criterios de aceptación**
- [x] Hay una respuesta de Cocos que autoriza o descarta usar migraciones en Neon.
- [x] Hasta tener esa respuesta, la app nunca se inicia con `DATABASE_URL` apuntando a Neon, porque las migraciones se aplican solas al iniciar.

### T0.2 — Limpiar el scaffold de NestJS

**Objetivo:** dejar el proyecto sin el código de ejemplo de NestJS.

**Subtareas**
- [x] Eliminar o reemplazar el test e2e de ejemplo (`test/app.e2e-spec.ts`), que espera "Hello World!".
- [x] Reemplazar el README por defecto de NestJS por un README mínimo en español (se completa en T9.1).

**Criterios de aceptación**
- [x] `npm run build` y `npm run lint` terminan sin errores.
- [x] No quedan referencias a "Hello World" en el repo.

### T0.3 — Configuración y variables de entorno

**Objetivo:** centralizar la configuración y validar las variables de entorno al iniciar.

**Subtareas**
- [x] Instalar `@nestjs/config` y `joi`.
- [x] Registrar `ConfigModule` como global, con un esquema Joi que valide:
  - [x] `DATABASE_URL`: obligatoria, URI de Postgres. Sin valor por defecto en el código: el valor por defecto lo dan `docker-compose.yml` y `.env.example`.
  - [x] `PORT`: opcional, numérica, por defecto `3000`.
- [x] Leer `PORT` desde la configuración en el bootstrap.
- [x] Crear `.env.example` con todas las variables y valores de ejemplo, sin credenciales reales. `DATABASE_URL` apunta a la base de Docker Compose desde la máquina local (host `localhost`), para correr la app con npm.

**Criterios de aceptación**
- [x] Sin `DATABASE_URL`, la app no inicia y el error indica qué variable falta.
- [x] Con un `PORT` inválido (ej. `abc`), la app no inicia.
- [x] `.env.example` está commiteado y `.env` no.

### T0.4 — Bootstrap HTTP: validación global y logger

**Objetivo:** configurar el comportamiento HTTP común a todos los endpoints.

**Subtareas**
- [x] Instalar `class-validator` y `class-transformer`.
- [x] Registrar un `ValidationPipe` global con `whitelist`, `forbidNonWhitelisted` y `transform`.

**Criterios de aceptación**
- [x] Al iniciar, el log muestra el puerto en el que escucha la app.

### T0.5 — Documentación OpenAPI (Swagger) base

**Objetivo:** dejar Swagger listo para que cada endpoint se documente a medida que se crea.

**Subtareas**
- [ ] Instalar `@nestjs/swagger`.
- [ ] Configurar el documento (título, descripción y versión, en español).
- [ ] Servir la UI en `/api/docs`.
- [ ] Declarar el header `X-User-Id` para poder reutilizarlo en los endpoints que lo necesitan.

**Criterios de aceptación**
- [ ] `GET /api/docs` muestra la UI de Swagger.
- [ ] El JSON de OpenAPI se puede descargar (por defecto en `/api/docs-json`).
- [ ] Todos los textos del documento están en español.

---

## Fase 1 — Docker

### T1.1 — Dockerfile de la API

**Objetivo:** empaquetar la API en una imagen que corra igual en cualquier máquina con Docker.

**Subtareas**
- [ ] Escribir un Dockerfile multi-stage:
  - [ ] Etapa de build: `npm ci` + `npm run build`.
  - [ ] Etapa final: solo dependencias de producción y `dist/`.
- [ ] Usar una imagen base de Node con versión mayor fija, la misma que en desarrollo (ej. `node:24-alpine`).
- [ ] Crear `.dockerignore` que excluya `node_modules`, `dist`, `.env`, `.git` y `coverage`.
- [ ] Exponer el puerto de la app y arrancar con `node dist/main`.

**Criterios de aceptación**
- [ ] `docker build .` termina sin errores.
- [ ] La imagen final no contiene `.env`, código fuente TypeScript ni dependencias de desarrollo.
- [ ] El contenedor arranca con las variables de entorno que recibe.

### T1.2 — Docker Compose (base de datos + API)

**Objetivo:** levantar base y API con un solo comando, con los datos de `database.sql`.

**Subtareas**
- [ ] Servicio `db`:
  - [ ] Imagen `postgres:18` (igual versión que Neon), con usuario, contraseña y base solo de desarrollo.
  - [ ] Montar `database.sql` en `/docker-entrypoint-initdb.d/` para que se ejecute en la primera inicialización.
  - [ ] Volumen con nombre para los datos. En `postgres:18` se monta en `/var/lib/postgresql` (cambió respecto de versiones anteriores).
  - [ ] Healthcheck con `pg_isready`.
  - [ ] Publicar el puerto 5432, para poder correr la app con npm contra esta base.
- [ ] Servicio `api`:
  - [ ] Construido con el Dockerfile de T1.1.
  - [ ] Espera a que `db` esté sana (`depends_on` con `condition: service_healthy`).
  - [ ] Publica el puerto de la API.
  - [ ] `DATABASE_URL` apunta por defecto a `db` (definido en `docker-compose.yml`, no en el código) y se puede sobrescribir desde `.env` (ej. Neon).

**Criterios de aceptación**
- [ ] Con el repo recién clonado, `docker compose up` deja la API respondiendo en `http://localhost:<PORT>` sin configurar nada más.
- [ ] En el primer arranque, la base tiene exactamente los datos de `database.sql`: 4 usuarios, 66 instrumentos, 126 filas de `marketdata` y 11 órdenes.
- [ ] `docker compose down -v` seguido de `docker compose up` deja la base otra vez en el estado del seed.
- [ ] `docker-compose.yml` no contiene nada de Neon.

---

## Fase 2 — Acceso a datos con TypeORM

### T2.1 — Conexión y configuración de migraciones

**Objetivo:** conectar la app a Postgres con TypeORM y aplicar migraciones automáticamente al iniciar.

**Subtareas**
- [ ] Instalar `@nestjs/typeorm`, `typeorm` y `pg`.
- [ ] Configurar `TypeOrmModule.forRootAsync` leyendo `DATABASE_URL` desde `ConfigService`.
- [ ] `synchronize: false` en todos los entornos (el esquema sale de `database.sql` + migraciones).
- [ ] `migrationsRun: true`, para aplicar las migraciones pendientes al iniciar.
- [ ] Crear un `DataSource` para la CLI de TypeORM con la misma configuración.
- [ ] Agregar scripts npm `migration:create`, `migration:run` y `migration:revert`.

**Criterios de aceptación**
- [ ] La app se conecta a la base de Docker Compose.
- [ ] La configuración funciona tanto sin SSL como con una URL con `sslmode=require` (lo de Neon se verifica en T9.3).
- [ ] Al iniciar, TypeORM crea su tabla `migrations` y aplica las pendientes. Al reiniciar no las vuelve a aplicar.
- [ ] Si la base no está disponible, la app falla con un error claro en el log.

### T2.2 — Entidades

**Objetivo:** mapear las tablas existentes sin cambiar el esquema.

**Subtareas**
- [ ] Crear entidades `User`, `Instrument`, `Order` y `MarketData` sobre las tablas `users`, `instruments`, `orders` y `marketdata`.
- [ ] Usar propiedades en camelCase mapeadas a los nombres reales en minúsculas (ej. `instrumentId` → `instrumentid`, `previousClose` → `previousclose`, `accountNumber` → `accountnumber`).
- [ ] Mantener `marketdata.date` como columna `date`.
- [ ] Definir en código los valores permitidos de:
  - [ ] `side`: BUY, SELL, CASH_IN, CASH_OUT.
  - [ ] `type` de orden: MARKET, LIMIT.
  - [ ] `status`: NEW, FILLED, REJECTED, CANCELLED.
  - [ ] `type` de instrumento: ACCIONES, MONEDA.
- [ ] Declarar las relaciones `Order` → `User`, `Order` → `Instrument` y `MarketData` → `Instrument`.

**Criterios de aceptación**
- [ ] Leer filas de las cuatro tablas devuelve todas las columnas mapeadas, sin `undefined` por nombres mal escritos.
- [ ] Las columnas `NUMERIC` se leen sin pérdida de precisión. La conversión a `number` se hace recién al armar la respuesta.
- [ ] Las entidades no provocan ningún cambio de esquema.

---

## Fase 3 — Migraciones de esquema

### T3.1 — Restricciones NOT NULL y CHECK

**Objetivo:** que la base rechace datos incompletos o con valores no permitidos.

**Subtareas**
- [ ] NOT NULL en:
  - [ ] `users`: `email`, `accountnumber`.
  - [ ] `instruments`: `ticker`, `name`, `type`.
  - [ ] `orders`: `instrumentid`, `userid`, `side`, `type`, `status`, `size`, `price`, `datetime`.
  - [ ] `marketdata`: `instrumentid`, `date`, `close`, `previousclose`.
- [ ] Dejar opcionales `marketdata.open`, `high` y `low`, porque DOME y POLL tienen esos valores vacíos en el seed.
- [ ] CHECK con los valores permitidos en `orders.side`, `orders.type`, `orders.status` e `instruments.type`.
- [ ] Escribir un `down` que revierta todo.

**Criterios de aceptación**
- [ ] La migración corre sin errores sobre el seed.
- [ ] Insertar una orden con `status = 'FILED'`, o sin `userid`, falla en la base.
- [ ] `npm run migration:revert` deja el esquema como estaba.

### T3.2 — Unicidad e índices

**Objetivo:** garantizar unicidad donde la lógica la supone y acelerar las consultas frecuentes.

**Subtareas**
- [ ] UNIQUE en `instruments.ticker`.
- [ ] UNIQUE en `marketdata (instrumentid, date)`. Su índice también sirve para buscar el último precio.
- [ ] Índice en `orders (userid, status, instrumentid)`.
- [ ] Escribir un `down` que revierta todo.

**Criterios de aceptación**
- [ ] La migración corre sin errores sobre el seed.
- [ ] Insertar un ticker repetido, o una segunda fila de `marketdata` para el mismo instrumento y día, falla.
- [ ] Los índices existen (se ven con `\d orders` y `\d marketdata`).
- [ ] `npm run migration:revert` deja el esquema como estaba.

### T3.3 — Extensión `unaccent`

**Objetivo:** permitir búsquedas que ignoren acentos.

**Subtareas**
- [ ] `CREATE EXTENSION IF NOT EXISTS unaccent`.
- [ ] Escribir un `down` con `DROP EXTENSION IF EXISTS unaccent`.

**Criterios de aceptación**
- [ ] `SELECT unaccent('Compañía Río')` devuelve `Compania Rio` en la base de Docker.
- [ ] `npm run migration:revert` elimina la extensión.

### T3.4 — Función SQL de posiciones por usuario

**Objetivo:** calcular en Postgres las posiciones de un usuario, incluido el PPC, procesando solo sus órdenes.

**Subtareas**
- [ ] Crear una función que reciba el id del usuario (ej. `user_positions(p_user_id)`) y devuelva una fila por instrumento con: id, ticker y nombre del instrumento, cantidad, PPC, último precio, valor de mercado y rendimiento total.
- [ ] Usar solo órdenes `FILLED` con `side` BUY o SELL (las de efectivo quedan afuera).
- [ ] Implementar el algoritmo del PPC recorriendo las órdenes por `datetime` y `id`.
- [ ] Tomar como último precio el `close` de la fila con la `date` más reciente del instrumento.
- [ ] Hacer todo el cálculo con `NUMERIC`.
- [ ] Excluir posiciones con cantidad 0 y mantener las negativas.
- [ ] Escribir un `down` que elimine la función.

**Criterios de aceptación**
- [ ] Para el usuario 1 devuelve exactamente PAMP, METR y BMA, con los valores de la tabla de referencia.
- [ ] Para los usuarios 2, 3 y 4 no devuelve filas.
- [ ] Con datos de prueba (dentro de una transacción que después se revierte): compra 10 a 100, venta de 5, compra 5 a 200 → PPC `150`.
- [ ] Una posición vendida por completo no aparece. Si después se vuelve a comprar, el PPC es el precio de la nueva compra.
- [ ] `npm run migration:revert` elimina la función.

---

## Fase 4 — Piezas transversales

### T4.1 — Filtro global de excepciones

**Objetivo:** que todos los errores tengan el mismo formato, sin exponer detalles internos.

**Subtareas**
- [ ] Crear un filtro global que responda siempre con `statusCode`, `message`, `error`, `path` y `timestamp`.
- [ ] `message` va en español: un texto, o una lista de textos en los errores de validación.
- [ ] `error` lleva el nombre HTTP estándar en inglés (`Bad Request`, `Not Found`, `Conflict`, `Internal Server Error`).
- [ ] Mapear errores de Postgres:
  - [ ] `23503` (clave foránea) → 404.
  - [ ] `23505` (valor duplicado) → 409.
  - [ ] `22P02` (formato inválido) → 400.
  - [ ] `23514` (CHECK) → 400.
  - [ ] `23502` (NOT NULL) → 400.
- [ ] Cualquier otro error responde 500 con un mensaje genérico en español, sin SQL ni stack. El detalle se registra con el `Logger`.
- [ ] Documentar el formato de error en Swagger.

**Criterios de aceptación**
- [ ] Un error tiene esta forma:
  ```json
  {
    "statusCode": 404,
    "message": "Usuario no encontrado",
    "error": "Not Found",
    "path": "/portfolio",
    "timestamp": "2026-11-23T14:00:00.000Z"
  }
  ```
- [ ] Los errores de validación de T0.4 salen con el mismo formato.
- [ ] Un error de base no mapeado devuelve 500 sin detalles internos y queda registrado en el log.

### T4.2 — Identificación del usuario por header `X-User-Id`

**Objetivo:** resolver el usuario de cada request desde un header, de forma reutilizable.

**Subtareas**
- [ ] Crear un mecanismo reutilizable (guard, decorador o pipe) que lea `X-User-Id`.
- [ ] Si el header falta, está vacío, no es un entero positivo o el usuario no existe → 404 "Usuario no encontrado".
- [ ] Entregar el usuario resuelto al handler.
- [ ] Documentar el header en Swagger en los endpoints que lo usan.

**Criterios de aceptación**
- [ ] Se aplica a `GET /portfolio` y `POST /orders`. No se aplica a `GET /instruments` ni a la cancelación.
- [ ] Sin header, o con `X-User-Id` igual a `999`, `abc`, `0`, `-1` o `1.5` → 404 con el formato de T4.1.
- [ ] Con `X-User-Id: 1`, el handler recibe el usuario 1.
- [ ] El header se valida antes que el body.

---

## Fase 5 — Saldos y portfolio

### T5.1 — Cálculo de saldos del usuario

**Objetivo:** tener en un solo lugar el cálculo de efectivo y acciones disponibles, para usarlo desde el portfolio y desde las órdenes.

**Subtareas**
- [ ] Escribir consultas SQL que devuelvan, para un usuario, el efectivo total, `reservedCash` y `availableCash`, según las fórmulas de referencia.
- [ ] Escribir una consulta que devuelva las acciones disponibles para vender de un usuario en un instrumento (cantidad − SELL `NEW`).
- [ ] Hacer todo el cálculo con `NUMERIC` en Postgres.
- [ ] Permitir que estas consultas corran dentro de una transacción en curso (la necesita T7.5).

**Criterios de aceptación**
- [ ] Usuario 1: efectivo total `753000`, `reservedCash` `125500`, `availableCash` `627500`.
- [ ] Usuarios 2, 3 y 4: todos los saldos en `0`.
- [ ] Usuario 1: `40` acciones disponibles de PAMP y `-10` de BMA.
- [ ] Las órdenes `REJECTED` y `CANCELLED` no afectan ningún saldo.

### T5.2 — Endpoint `GET /portfolio`

**Objetivo:** devolver el valor total de la cuenta, el efectivo y las posiciones del usuario.

**Subtareas**
- [ ] Crear el endpoint, que identifica al usuario con `X-User-Id` (T4.2).
- [ ] Usar la función de posiciones (T3.4) y los saldos (T5.1).
- [ ] Convertir los `NUMERIC` a `number` sin redondear.
- [ ] Ordenar `positions` alfabéticamente por ticker.
- [ ] Documentar en Swagger, en español, con un ejemplo de respuesta.

**Respuesta esperada** (el rendimiento está abreviado en el ejemplo):

```json
{
  "totalValue": 889756,
  "availableCash": 627500,
  "reservedCash": 125500,
  "positions": [
    { "ticker": "BMA", "name": "Banco Macro S.A.", "quantity": -10, "latestPrice": 1502.8, "marketValue": -15028, "totalReturn": -0.0241558 },
    { "ticker": "METR", "name": "MetroGAS S.A.", "quantity": 500, "latestPrice": 229.5, "marketValue": 114750, "totalReturn": -0.082 },
    { "ticker": "PAMP", "name": "Pampa Holding S.A.", "quantity": 40, "latestPrice": 925.85, "marketValue": 37034, "totalReturn": -0.0044624 }
  ]
}
```

**Criterios de aceptación**
- [ ] El usuario 1 recibe los valores de la tabla de referencia.
- [ ] ARS nunca aparece en `positions`. El efectivo solo figura en `availableCash` y `reservedCash`.
- [ ] Las posiciones con cantidad 0 no aparecen. La de BMA aparece con cantidad `-10`.
- [ ] Un usuario sin órdenes recibe `{ "totalValue": 0, "availableCash": 0, "reservedCash": 0, "positions": [] }`.
- [ ] Un usuario inexistente, o un header inválido o ausente, responde 404.
- [ ] La respuesta no expone datos sensibles (email, número de cuenta) ni ids internos.
- [ ] Los números son `number` de JSON, sin redondeo. El rendimiento es una fracción.
- [ ] `totalValue` es igual a `availableCash` + `reservedCash` + Σ `marketValue`.

---

## Fase 6 — Búsqueda de activos

### T6.1 — Endpoint `GET /instruments`

**Objetivo:** buscar activos por ticker o nombre, con ranking, paginación, último precio y retorno diario.

**Subtareas**
- [ ] Recibir los query params:
  - [ ] `q`: opcional.
  - [ ] `page`: entero ≥ 1, por defecto `1`.
  - [ ] `limit`: entero ≥ 1, por defecto `20`, sin máximo.
- [ ] Validarlos con un DTO de query y mensajes en español. Valores inválidos (0, negativos, decimales, texto) → 400.
- [ ] Buscar con "contiene" sobre `ticker` o `name`, sin distinguir mayúsculas ni acentos (`unaccent` sobre el texto buscado y sobre la columna).
- [ ] Escapar `%`, `_` y `\` del texto del usuario, para que se busquen literalmente.
- [ ] Si `q` está vacío o ausente, devolver todos los instrumentos (paginados y ordenados por ticker). Un `q` de un solo carácter hace una búsqueda normal.
- [ ] Rankear los resultados en este orden, y alfabéticamente por ticker dentro de cada grupo. Cada instrumento aparece una sola vez, en su mejor grupo.
  1. Ticker exacto.
  2. Ticker que empieza con `q`.
  3. Nombre que empieza con `q`.
  4. `q` aparece en cualquier parte del ticker o del nombre.
- [ ] Incluir ARS en los resultados. No hay filtro por tipo.
- [ ] Calcular `latestPrice` (último `close`) por instrumento: `null` si no es `ACCIONES` o no tiene datos de mercado.
- [ ] Calcular `dailyReturn` por instrumento: `null` si no es `ACCIONES` o no tiene datos de mercado.
- [ ] Devolver `{ data, meta: { page, limit, total, totalPages } }`. Cada ítem: `{ ticker, name, type, latestPrice, dailyReturn }`.
- [ ] No requerir el header de usuario.
- [ ] Documentar en Swagger, en español, con ejemplos.

**Criterios de aceptación**
- [ ] `q=ga` devuelve, en este orden: GAMI, GARO, GBAN, CGPA2, DGCU2, GGAL, METR, TGNO4, TGSU2 (`total` 9).
- [ ] `q=ggal` y `q=GGAL` devuelven GGAL en primer lugar.
- [ ] `q=compania` incluye INTR, y `q=rio` incluye MOLI (Molinos Río de la Plata).
- [ ] `q=%` y `q=_` no devuelven resultados (`total` 0).
- [ ] `q=ars` devuelve ARS en primer lugar, con `latestPrice: null` y `dailyReturn: null`.
- [ ] PGR e IRCP → `latestPrice: null` y `dailyReturn: null`.
- [ ] PAMP → `latestPrice` `925.85` y `dailyReturn` ≈ `0.0043936`. GGAL → `latestPrice` `885.8` y `dailyReturn` ≈ `-0.0348134`.
- [ ] Sin `q`: `total` 66 y `totalPages` 4 (con `limit` 20). `page=4` trae 6 ítems. `page=5` devuelve `data: []` con `meta` correcto.
- [ ] Sin `page` ni `limit`, se usan `page=1` y `limit=20`.
- [ ] `page=0`, `page=1.5`, `limit=0`, `limit=-5` o `limit=abc` → 400 con mensaje en español.
- [ ] Un query param desconocido → 400.

---

## Fase 7 — Órdenes

### T7.1 — `POST /orders`: órdenes MARKET por cantidad

**Objetivo:** crear el endpoint de envío de órdenes con la ejecución inmediata de BUY y SELL MARKET.

**Subtareas**
- [ ] Crear `POST /orders`, que identifica al usuario con `X-User-Id` (T4.2).
- [ ] Definir el DTO con `ticker` (texto), `side` (BUY, SELL, CASH_IN, CASH_OUT), `type` (MARKET, LIMIT), `size` (entero > 0) y `price` (en MARKET se ignora, sin validarlo). Todos los mensajes en español.
- [ ] Hasta completar T7.2–T7.4, LIMIT, `amount` y CASH_IN/CASH_OUT pueden responder 400.
- [ ] Buscar el instrumento por `ticker` exacto (distingue mayúsculas). Si no existe → 404 "Instrumento no encontrado".
- [ ] BUY/SELL sobre un instrumento de tipo `MONEDA` → 400.
- [ ] Usar como precio el último `close`.
- [ ] Aplicar las reglas de negocio:
  - [ ] Sin datos de mercado → `REJECTED` con `NO_MARKET_DATA` y `price` `0`.
  - [ ] BUY con `size × close` > `availableCash` → `REJECTED` con `INSUFFICIENT_FUNDS`.
  - [ ] SELL con `size` > acciones disponibles → `REJECTED` con `INSUFFICIENT_SHARES`.
  - [ ] Si pasa todas las reglas → `FILLED`.
- [ ] Guardar siempre la orden (`FILLED` o `REJECTED`), con `datetime` asignado por Postgres.
- [ ] Crear el mapa código → mensaje en español para los rechazos.
- [ ] Responder 201 con el formato de respuesta de referencia.
- [ ] Documentar en Swagger con ejemplos `FILLED` y `REJECTED`.

**Criterios de aceptación**
- [ ] Usuario 1, MARKET BUY 10 PAMP → 201 `FILLED` con `price` `925.85`. En una base recién creada, la nueva fila tiene id 12.
- [ ] Usuario 1, MARKET SELL 10 PAMP → `FILLED`.
- [ ] Usuario 1, MARKET BUY 3000 METR (`688500`, más que los `627500` disponibles aunque menos que los `753000` totales) → `REJECTED` con `INSUFFICIENT_FUNDS`. La fila queda guardada con `size` 3000 y `price` 229.5.
- [ ] Usuario 1, MARKET SELL 41 PAMP → `REJECTED` con `INSUFFICIENT_SHARES`.
- [ ] MARKET BUY 1 PGR → `REJECTED` con `NO_MARKET_DATA` y `price` `0`.
- [ ] `ticker: "pamp"` → 404. BUY con `ticker: "ARS"` → 400.
- [ ] La respuesta no incluye `userId` ni `instrumentId`. `rejection` es `null` salvo en `REJECTED`.
- [ ] Después de una orden `FILLED`, el portfolio la refleja.

### T7.2 — Órdenes LIMIT

**Objetivo:** aceptar órdenes LIMIT, que quedan en espera y reservan efectivo o acciones.

**Subtareas**
- [ ] `price` obligatorio en LIMIT: número > 0 con hasta 2 decimales. Si falta o es inválido → 400.
- [ ] Guardar con `price` igual al precio límite y `status` `NEW`, aunque el precio de mercado sea mejor.
- [ ] Validar al enviarla: BUY con `size × precio límite` ≤ `availableCash`, SELL con `size` ≤ acciones disponibles. Si no alcanza → `REJECTED`.
- [ ] Instrumento sin datos de mercado → `REJECTED` con `NO_MARKET_DATA` y `price` igual al precio límite.
- [ ] Confirmar que una BUY `NEW` suma a `reservedCash` y una SELL `NEW` descuenta acciones disponibles.

**Criterios de aceptación**
- [ ] Usuario 1, LIMIT BUY 10 PAMP a 900 → `NEW` con `price` 900. `reservedCash` sube `9000` y `availableCash` baja `9000`.
- [ ] LIMIT BUY 10 PAMP a 1000 (por encima del mercado) → `NEW`, no se ejecuta.
- [ ] LIMIT BUY 3000 METR a 229.50 → `REJECTED` con `INSUFFICIENT_FUNDS`.
- [ ] Dos LIMIT BUY de 2000 METR a 229.50 seguidas → la primera `NEW` y la segunda `REJECTED` (la reserva de la primera deja `168500` disponibles).
- [ ] LIMIT SELL 40 PAMP a 1000 → `NEW`. Después, MARKET SELL 1 PAMP → `REJECTED` con `INSUFFICIENT_SHARES`.
- [ ] LIMIT BUY 1 PGR a 100 → `REJECTED` con `NO_MARKET_DATA` y `price` 100.
- [ ] LIMIT sin `price`, o con `price` 0, negativo o con 3 decimales → 400.

### T7.3 — Órdenes por monto en pesos

**Objetivo:** permitir indicar un monto en pesos en lugar de una cantidad de acciones.

**Subtareas**
- [ ] Agregar el campo `amount`: número > 0 con hasta 2 decimales, para BUY y SELL.
- [ ] BUY/SELL deben traer exactamente uno de `size` o `amount`. Si no trae ninguno, o trae ambos → 400.
- [ ] Calcular `size = floor(amount ÷ precio)`, con el último `close` en MARKET y el precio límite en LIMIT.
- [ ] Si el `size` calculado es 0 → `REJECTED` con `AMOUNT_TOO_LOW` y `size` `0`.
- [ ] MARKET por monto sobre un instrumento sin datos de mercado → `REJECTED` con `NO_MARKET_DATA`, `size` `0` y `price` `0`.
- [ ] Respetar la prioridad de los códigos de rechazo.

**Criterios de aceptación**
- [ ] MARKET BUY con `amount` 50000 de PAMP → `FILLED` con `size` 54 y `price` 925.85.
- [ ] LIMIT BUY con `amount` 50000 de PAMP a 900 → `NEW` con `size` 55.
- [ ] Usuario 1, MARKET SELL con `amount` 9000 de PAMP → `FILLED` con `size` 9.
- [ ] Usuario 1, MARKET SELL con `amount` 50000 de PAMP (tiene 40) → `REJECTED` con `INSUFFICIENT_SHARES` y `size` 54.
- [ ] MARKET BUY con `amount` 500 de PAMP → `REJECTED` con `AMOUNT_TOO_LOW` y `size` 0.
- [ ] Usuario 2 (sin efectivo), BUY con `amount` 100 de PAMP → `AMOUNT_TOO_LOW`, no `INSUFFICIENT_FUNDS`.
- [ ] MARKET BUY con `amount` 1000 de PGR → `NO_MARKET_DATA` con `size` 0 y `price` 0.
- [ ] `size` y `amount` juntos, ninguno de los dos, o `amount` 0, negativo o con 3 decimales → 400.

### T7.4 — Transferencias CASH_IN / CASH_OUT

**Objetivo:** registrar depósitos y extracciones de pesos a través de `POST /orders`.

**Subtareas**
- [ ] Exigir `ticker: "ARS"`. Con otro ticker → 400.
- [ ] Exigir `type: "MARKET"`. Con LIMIT → 400.
- [ ] Exigir `amount`, entero > 0. Si falta o tiene decimales → 400.
- [ ] Ignorar `size` y `price` si vienen en el body.
- [ ] Guardar con instrumento ARS, `size = amount`, `price` `1` y `type` `MARKET`.
- [ ] CASH_IN → `FILLED`.
- [ ] CASH_OUT con `amount` > `availableCash` → `REJECTED` con `INSUFFICIENT_FUNDS`. Si no, `FILLED`.

**Criterios de aceptación**
- [ ] Usuario 2, CASH_IN de 10000 → `FILLED` con `size` 10000 y `price` 1. Después puede comprar por hasta 10000.
- [ ] Usuario 1, CASH_OUT de 627500 → `FILLED`. Después su `availableCash` es 0.
- [ ] Usuario 1, CASH_OUT de 700000 (menos que los 753000 totales, más que los 627500 disponibles) → `REJECTED` con `INSUFFICIENT_FUNDS`.
- [ ] CASH_IN con `ticker: "PAMP"`, con `type: "LIMIT"`, sin `amount` o con `amount` 100.5 → 400.
- [ ] CASH_IN que trae `size` además de `amount` → se ignora `size`.

### T7.5 — Control de concurrencia

**Objetivo:** que dos órdenes simultáneas del mismo usuario no puedan gastar el mismo dinero ni vender las mismas acciones.

**Subtareas**
- [ ] Ejecutar todo el envío de una orden (saldos, validaciones de negocio e insert) dentro de una transacción.
- [ ] Al comienzo de la transacción, bloquear la fila del usuario con `SELECT ... FOR UPDATE` (en TypeORM, lock `pessimistic_write`).
- [ ] Aplicarlo a todas las órdenes que envía el endpoint.

**Criterios de aceptación**
- [ ] Usuario 1, dos MARKET BUY simultáneas de 2000 METR (`459000` cada una, juntas superan `627500`) → una `FILLED` y otra `REJECTED` con `INSUFFICIENT_FUNDS`.
- [ ] Usuario 1, dos MARKET SELL simultáneas de 30 PAMP (tiene 40) → una `FILLED` y otra `REJECTED` con `INSUFFICIENT_SHARES`.
- [ ] Las órdenes simultáneas de usuarios distintos no se bloquean entre sí.
- [ ] Si algo falla a mitad de camino, no queda ninguna orden guardada a medias.

### T7.6 — Cancelación de órdenes

**Objetivo:** permitir cancelar órdenes en espera.

**Subtareas**
- [ ] Crear `POST /orders/:orderId/cancel`, sin header de usuario y sin verificar a quién pertenece la orden.
- [ ] `orderId` no numérico o inexistente → 404 "Orden no encontrada".
- [ ] Orden con un estado distinto de `NEW` → 409, con un mensaje en español que indique el estado actual.
- [ ] Actualizar de forma atómica (`UPDATE ... WHERE id = ... AND status = 'NEW'`), para que dos cancelaciones simultáneas no se pisen.
- [ ] Responder 200 con el formato de orden de referencia, `status: "CANCELLED"` y `rejection: null`.
- [ ] Documentar en Swagger.

**Criterios de aceptación**
- [ ] Cancelar la orden 5 del seed (LIMIT BUY 50 LOMA, `NEW`) → 200 `CANCELLED`. El `reservedCash` del usuario 1 baja `35500` y su `availableCash` sube `35500`.
- [ ] Cancelar la orden 2 (`FILLED`), la 3 (`CANCELLED`) o la 6 (`REJECTED`) → 409.
- [ ] `orderId` 999 o `abc` → 404.
- [ ] Dos cancelaciones simultáneas de la misma orden → una 200 y otra 409.

---

## Fase 8 — Tests funcionales del envío de órdenes

Todos los tests son HTTP (supertest) contra `POST /orders`, sobre una base real en un contenedor.
- **201:** se verifican la respuesta y la fila guardada en `orders`.
- **4xx:** se verifican el formato del error y que la cantidad de órdenes no cambió.

### T8.1 — Infraestructura de tests con Testcontainers

**Objetivo:** que los tests corran contra un Postgres real, descartable y siempre en el estado del seed.

**Subtareas**
- [ ] Instalar `@testcontainers/postgresql`.
- [ ] Levantar un contenedor `postgres:18` por corrida y cargar `database.sql`.
- [ ] Crear la app Nest de test apuntando a ese contenedor. Las migraciones se aplican solas al iniciar.
- [ ] Antes de cada test, restaurar el seed: vaciar las tablas reiniciando los ids y volver a insertar los datos de `database.sql`.
- [ ] Ajustar `test/jest-e2e.json` (timeouts, setup y teardown) y el script `test:e2e`.
- [ ] Crear helpers para enviar órdenes y leer filas de `orders`.
- [ ] Detener el contenedor al terminar.

**Criterios de aceptación**
- [ ] `npm run test:e2e` corre con Docker abierto, sin `.env` ni otra configuración.
- [ ] Cada test arranca exactamente con el seed: la primera orden nueva tiene id 12.
- [ ] Los tests nunca tocan la base de Docker Compose ni Neon.
- [ ] Sin Docker, los tests fallan con un mensaje claro.

### T8.2 — Tests: órdenes ejecutadas y aceptadas

**Casos**
- [ ] MARKET BUY por `size` → `FILLED` con `price` igual al último `close` (PAMP 925.85).
- [ ] MARKET SELL por `size` dentro de la tenencia → `FILLED`.
- [ ] MARKET BUY por `amount` → `size` redondeado hacia abajo (50000 de PAMP → 54).
- [ ] MARKET SELL por `amount` → `size` redondeado hacia abajo (9000 de PAMP → 9).
- [ ] LIMIT BUY por `size` → `NEW` con el precio límite.
- [ ] LIMIT BUY por `amount` → `size = floor(amount ÷ límite)` (50000 a 900 → 55).
- [ ] LIMIT SELL → `NEW`.
- [ ] LIMIT BUY con precio por encima del mercado → sigue `NEW`.
- [ ] MARKET con `price` en el body → se ignora y se usa el último `close`.
- [ ] CASH_IN → `FILLED`, instrumento ARS, `size = amount`, `price` 1.
- [ ] CASH_IN con `size` en el body → se ignora.
- [ ] CASH_OUT dentro de `availableCash` → `FILLED`.
- [ ] Usuario 2: después de un CASH_IN puede comprar.
- [ ] `datetime` lo asigna la base: no es nulo y es reciente.
- [ ] La respuesta tiene exactamente los campos acordados, sin `userId` ni `instrumentId`, y con `rejection: null`.

**Criterios de aceptación**
- [ ] Todos los casos pasan, y cada uno verifica la respuesta y la fila guardada.

### T8.3 — Tests: órdenes rechazadas

En cada caso se espera 201, `status: "REJECTED"`, `rejection` con el código y el mensaje en español, y la fila guardada con el `size` y el `price` esperados.

**Casos**
- [ ] BUY por más que `availableCash` → `INSUFFICIENT_FUNDS`.
- [ ] BUY que entra en el efectivo total pero no en el disponible, por las órdenes reservadas (3000 METR) → `INSUFFICIENT_FUNDS`.
- [ ] LIMIT BUY sin fondos suficientes → `INSUFFICIENT_FUNDS`.
- [ ] Dos LIMIT BUY que juntas superan lo disponible → la segunda `REJECTED`.
- [ ] Usuario 2, sin efectivo, compra 1 PAMP → `INSUFFICIENT_FUNDS`.
- [ ] SELL por más que la tenencia (41 PAMP) → `INSUFFICIENT_SHARES`.
- [ ] SELL de un activo que no tiene (usuario 2) → `INSUFFICIENT_SHARES`.
- [ ] SELL sobre la posición negativa del seed (BMA, usuario 1) → `INSUFFICIENT_SHARES`.
- [ ] SELL bloqueada porque una SELL `NEW` reserva las acciones → `INSUFFICIENT_SHARES`.
- [ ] SELL por monto mayor que la tenencia (50000 de PAMP → `size` 54) → `INSUFFICIENT_SHARES`.
- [ ] Monto insuficiente (500 de PAMP) → `AMOUNT_TOO_LOW` con `size` 0.
- [ ] MARKET sobre PGR y sobre IRCP → `NO_MARKET_DATA` con `price` 0.
- [ ] LIMIT sobre PGR → `NO_MARKET_DATA` con `price` igual al límite.
- [ ] MARKET por monto sobre PGR → `NO_MARKET_DATA` con `size` 0 y `price` 0.
- [ ] CASH_OUT por más que `availableCash` → `INSUFFICIENT_FUNDS`.
- [ ] CASH_OUT que entra en el total pero no en el disponible (700000, usuario 1) → `INSUFFICIENT_FUNDS`.
- [ ] Prioridad: PGR con monto bajo → `NO_MARKET_DATA`. Usuario 2 con monto bajo → `AMOUNT_TOO_LOW`.
- [ ] Una orden `REJECTED` no consume saldo: una orden válida posterior se ejecuta.

**Criterios de aceptación**
- [ ] Todos los casos pasan, verificando la respuesta y la fila guardada.

### T8.4 — Tests: validaciones (400) y recursos inexistentes (404)

En cada caso se verifican el código HTTP, el formato del error (`statusCode`, `message` en español, `error` en inglés, `path`, `timestamp`) y que la cantidad de órdenes no cambió.

**Casos 404**
- [ ] Sin `X-User-Id`, o con `abc`, `0`, `-1` o `999`.
- [ ] Ticker inexistente.
- [ ] Ticker en minúsculas (`pamp`).
- [ ] Header inválido con body inválido → 404 (el header se valida primero).

**Casos 400**
- [ ] JSON mal formado.
- [ ] Campo desconocido (ej. `datetime`, `userId`).
- [ ] Falta `ticker`, `side` o `type`.
- [ ] `side` o `type` con un valor fuera de la lista.
- [ ] BUY/SELL sin `size` ni `amount`.
- [ ] BUY/SELL con `size` y `amount` a la vez.
- [ ] `size` 0, negativo, decimal o texto.
- [ ] `amount` 0, negativo, con 3 decimales o texto.
- [ ] LIMIT sin `price`, o con `price` 0, negativo o con 3 decimales.
- [ ] BUY/SELL sobre ARS.
- [ ] CASH_IN/CASH_OUT sobre un ticker distinto de ARS.
- [ ] CASH_IN/CASH_OUT con `type` LIMIT.
- [ ] CASH_IN/CASH_OUT sin `amount`, o con `amount` decimal.

**Criterios de aceptación**
- [ ] Todos los casos pasan y ninguno deja órdenes guardadas.

### T8.5 — Tests: concurrencia

**Casos**
- [ ] Dos BUY simultáneas que juntas superan lo disponible → una `FILLED` y otra `REJECTED` con `INSUFFICIENT_FUNDS`.
- [ ] Dos SELL simultáneas que juntas superan las acciones → una `FILLED` y otra `REJECTED` con `INSUFFICIENT_SHARES`.
- [ ] CASH_OUT y BUY simultáneos que juntos superan lo disponible → uno `FILLED` y otro `REJECTED`.
- [ ] Al terminar cada caso, los saldos en la base son consistentes: `availableCash` ≥ 0, y las acciones disponibles de PAMP ≥ 0.

**Criterios de aceptación**
- [ ] El suite completo corre varias veces seguidas sin fallas intermitentes.

---

## Fase 9 — Documentación y cierre

### T9.1 — README

**Objetivo:** que cualquier persona pueda levantar, probar y entender el proyecto.

**Subtareas**
- [ ] Descripción breve del proyecto.
- [ ] Sección de setup y ejecución:
  - [ ] Requisitos: Docker Desktop. Node 24 y npm solo para desarrollo local.
  - [ ] Qué es Docker Compose, en dos líneas.
  - [ ] `docker compose up`, y cómo volver al seed con `docker compose down -v`.
  - [ ] Ejecución local con npm contra la base de Docker, con `.env` creado desde `.env.example`.
  - [ ] Cómo apuntar a otra base (ej. Neon), con la advertencia de que las migraciones se aplican solas al iniciar.
  - [ ] Comandos de migraciones.
  - [ ] Cómo correr los tests (requiere Docker).
  - [ ] URL de Swagger (`/api/docs`).
- [ ] Sección de arquitectura:
  - [ ] Componentes principales y sus responsabilidades.
  - [ ] Flujo de una orden: validación, bloqueo del usuario, saldos, reglas, guardado y respuesta.
  - [ ] Esquema de datos y migraciones, incluida la función de posiciones.
  - [ ] Cálculo de saldos y del PPC.
  - [ ] Formato de errores.
  - [ ] Manejo de concurrencia.

**Criterios de aceptación**
- [ ] Está escrito en español.
- [ ] Una persona sin contexto puede levantar el proyecto y correr los tests siguiendo solo el README.
- [ ] No contiene credenciales reales.

### T9.2 — Colección de Postman (recordatorio)

**Objetivo:** recordar armar la colección de Postman. El alcance se define más adelante.

**Subtareas**
- [ ] Definir el alcance: endpoints, entorno con `baseUrl` y ejemplos.
- [ ] Armar y exportar la colección al repo.

**Criterios de aceptación**
- [ ] La colección cubre todos los endpoints, con descripciones en español.
- [ ] No contiene credenciales.

### T9.3 — Verificación contra Neon *(condicional)*

**Objetivo:** confirmar que la API funciona contra la base hosteada. Solo se hace si Cocos lo autorizó en T0.1. Genera commit únicamente si hay cambios.

**Subtareas**
- [ ] Poner la URL de Neon en `.env`, sin commitearla.
- [ ] Iniciar la app y confirmar que las migraciones se aplican sin errores.
- [ ] Probar portfolio, búsqueda, envío y cancelación de órdenes, teniendo en cuenta que las órdenes de prueba quedan guardadas en Neon.
- [ ] Confirmar que el bloqueo de concurrencia funciona detrás del pooler de Neon.
- [ ] Volver `.env` a la base local.

**Criterios de aceptación**
- [ ] Los endpoints responden igual que contra la base local.
- [ ] Si Cocos no lo autorizó, la tarea se descarta y el README aclara que el proyecto usa la base local.

### T9.4 — Revisión final de la entrega

**Objetivo:** verificar el repo como lo vería un evaluador. Genera commit únicamente si hay correcciones.

**Subtareas**
- [ ] Clonar el repo en una carpeta nueva y seguir solo el README.
- [ ] `docker compose up` desde cero.
- [ ] Correr `npm run lint`, `npm run build` y `npm run test:e2e`.
- [ ] Revisar que Swagger documente todos los endpoints en español.
- [ ] Buscar en todo el historial de git que no aparezcan el host ni la contraseña de Neon.
- [ ] Confirmar que el repositorio es público y accesible.

**Criterios de aceptación**
- [ ] Todo lo anterior pasa sin intervención manual fuera del README.
- [ ] Ninguna credencial real aparece en el repo ni en su historial.
