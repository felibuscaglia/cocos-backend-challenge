# Plan de trabajo — Cocos Backend Challenge

Lista de tareas para completar el challenge de punta a punta. Cada tarea equivale a **un commit** directo a `main`. Dentro de cada tarea, las subtareas y los criterios de aceptación son checklists a verificar antes de commitear.

> Los valores numéricos se escriben como en JSON (punto decimal, sin separador de miles): `753000`, `925.85`.

---

## Convenciones

- **Idioma:** el código va en inglés. README, documentación, mensajes de commit, descripciones de Swagger, mensajes de error y de rechazo, y descripciones de Postman van en español.
- **Commits:** un commit por tarea, directo a `main`. Las tareas marcadas *(sin commit)* no generan cambios en el repo.
- **Credenciales:** la URL de la base hosteada (Neon) incluye la contraseña y el repositorio es público. Solo puede estar en `.env` (ignorado por git). Nunca en código, documentación, `.env.example`, colecciones ni mensajes de commit.
- **Base de datos:** `src/database/seed.sql` es la base del esquema y de los datos. Todo cambio se hace con migraciones de TypeORM encima.
- **Fuera de alcance por ahora:** CI, claves de idempotencia, simulación de mercado, ejecución automática de órdenes LIMIT, manejo de zonas horarias, comisiones y horarios de mercado.

---

## Reglas de negocio de referencia

### Glosario

- **Posición:** cantidad de acciones de un activo que tiene un usuario.
- **Orden en espera (NEW):** orden LIMIT aceptada que todavía no se ejecutó. En este proyecto nunca se ejecuta sola: solo puede cancelarse.
- **Efectivo reservado:** pesos apartados por órdenes BUY en espera. Siguen siendo del usuario, pero no puede usarlos para otra cosa.
- **PPC (precio promedio de compra):** costo promedio por acción de una posición.

### Fórmulas

Salvo aclaración, se usan solo órdenes `FILLED`. Las sumas se hacen en Postgres. Combinar valores con decimales (montos, rendimientos) se hace en el servicio con `decimal.js`, nunca con `number` de JavaScript; las cantidades enteras (acciones), con `number`. En las órdenes de efectivo `price = 1`, así que `size × price = size`.

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
- [x] T0.5 — Documentación OpenAPI (Swagger) base

**Fase 1 — Docker**
- [x] T1.1 — Dockerfile de la API
- [x] T1.2 — Docker Compose (base de datos + API)

**Fase 2 — Acceso a datos con TypeORM**
- [x] T2.1 — Conexión y configuración de migraciones
- [x] T2.2 — Entidades

**Fase 3 — Migraciones de esquema**
- [x] T3.1 — Restricciones NOT NULL y CHECK
- [x] T3.2 — Unicidad e índices
- [x] T3.3 — Extensión `unaccent`
- [x] T3.4 — Función SQL de posiciones por usuario

**Fase 4 — Piezas transversales**
- [x] T4.1 — Filtro global de excepciones
- [x] T4.2 — Identificación del usuario por header `X-User-Id`

**Fase 5 — Saldos y portfolio**
- [x] T5.1 — Cálculo de saldos del usuario
- [x] T5.2 — Endpoint `GET /portfolio`

**Fase 6 — Búsqueda de activos**
- [x] T6.1 — Endpoint `GET /instruments`

**Fase 7 — Órdenes**
- [x] T7.1 — `POST /orders`: órdenes MARKET por cantidad
- [x] T7.2 — Órdenes LIMIT
- [x] T7.3 — Órdenes por monto en pesos
- [x] T7.4 — Transferencias CASH_IN / CASH_OUT
- [x] T7.5 — Control de concurrencia
- [x] T7.6 — Cancelación de órdenes

**Fase 8 — Tests funcionales del envío de órdenes**
- [x] T8.1 — Infraestructura de tests con Testcontainers
- [x] T8.2 — Tests: órdenes ejecutadas y aceptadas
- [x] T8.3 — Tests: órdenes rechazadas
- [x] T8.4 — Tests: validaciones (400) y recursos inexistentes (404)
- [x] T8.5 — Tests: concurrencia

**Fase 9 — Documentación y cierre**
- [x] T9.1 — README
- [x] T9.2 — Colección de Postman (recordatorio)
- [ ] T9.3 — Revisión final de la entrega

---

## Fase 0 — Preparación

### T0.1 — Consultar a Cocos sobre la base hosteada *(sin commit)*

**Objetivo:** saber si se pueden aplicar migraciones sobre la base de Neon provista sin afectar a otros candidatos.

**Subtareas**
- [x] Preguntar si la base es exclusiva y si se pueden aplicar migraciones: restricciones, índices, la extensión `unaccent` y una función SQL.
- [x] Guardar la respuesta para decidir T9.3.

**Criterios de aceptación**
- [x] Hay una respuesta de Cocos que autoriza o descarta usar migraciones en Neon.
- [x] Hasta tener esa respuesta, la app nunca se inicia con `DATABASE_URL` apuntando a Neon, porque podría iniciarse con `RUN_MIGRATIONS=true` y aplicar las migraciones sobre esa base.

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
- [x] Instalar `@nestjs/swagger`.
- [x] Configurar el documento (título, descripción y versión, en español).
- [x] Servir la UI en `/api/docs`.

**Criterios de aceptación**
- [x] `GET /docs` muestra la UI de Swagger.
- [x] El JSON de OpenAPI se puede descargar
- [x] Todos los textos del documento están en español.

---

## Fase 1 — Docker

### T1.1 — Dockerfile de la API

**Objetivo:** empaquetar la API en una imagen que corra igual en cualquier máquina con Docker.

**Subtareas**
- [x] Escribir un Dockerfile multi-stage:
  - [x] Etapa de build: `npm ci` + `npm run build`.
  - [x] Etapa final: solo dependencias de producción y `dist/`.
- [x] Usar una imagen base de Node con versión mayor fija, la misma que en desarrollo.
- [x] Crear `.dockerignore` que excluya `node_modules`, `dist`, `.env`, `.git` y `coverage`.
- [x] Exponer el puerto de la app y arrancar con `node dist/main`.

**Criterios de aceptación**
- [x] `docker build .` termina sin errores.
- [x] La imagen final no contiene `.env`, código fuente TypeScript ni dependencias de desarrollo.
- [x] El contenedor arranca con las variables de entorno que recibe.

### T1.2 — Docker Compose (base de datos + API)

**Objetivo:** levantar base y API con un solo comando, con los datos de `src/database/seed.sql`.

**Subtareas**
- [x] Servicio `db`:
  - [x] Imagen `postgres:18` (igual versión que Neon), con usuario, contraseña y base solo de desarrollo.
  - [x] Montar `src/database/seed.sql` en `/docker-entrypoint-initdb.d/` para que se ejecute en la primera inicialización.
  - [x] Volumen con nombre para los datos. En `postgres:18` se monta en `/var/lib/postgresql` (cambió respecto de versiones anteriores).
  - [x] Healthcheck con `pg_isready`.
  - [x] Publicar el puerto 5432, para poder correr la app con npm contra esta base.
- [x] Servicio `api`:
  - [x] Construido con el Dockerfile de T1.1.
  - [x] Espera a que `db` esté sana (`depends_on` con `condition: service_healthy`).
  - [x] Publica el puerto de la API.
  - [x] `DATABASE_URL` apunta por defecto a `db` (definido en `docker-compose.yml`, no en el código) y se puede sobrescribir desde `.env` (ej. Neon).

**Criterios de aceptación**
- [x] Con el repo recién clonado, `docker compose up` deja la API respondiendo en `http://localhost:<PORT>` sin configurar nada más.
- [x] En el primer arranque, la base tiene exactamente los datos de `src/database/seed.sql`: 4 usuarios, 66 instrumentos, 126 filas de `marketdata` y 11 órdenes.
- [x] `docker compose down -v` seguido de `docker compose up` deja la base otra vez en el estado del seed.

---

## Fase 2 — Acceso a datos con TypeORM

### T2.1 — Conexión y configuración de migraciones

**Objetivo:** conectar la app a Postgres con TypeORM y aplicar migraciones al iniciar cuando `RUN_MIGRATIONS=true`.

**Subtareas**
- [x] Instalar `@nestjs/typeorm`, `typeorm` y `pg`.
- [x] Configurar `TypeOrmModule.forRootAsync` leyendo `DATABASE_URL` desde `ConfigService`.
- [x] `synchronize: false` en todos los entornos (el esquema sale de `src/database/seed.sql` + migraciones).
- [x] `migrationsRun` según la variable obligatoria `RUN_MIGRATIONS`, leída desde `ConfigService`.
- [x] Crear un `DataSource` para la CLI de TypeORM con la misma configuración.
- [x] Agregar scripts npm `migration:create`, `migration:run` y `migration:revert`.

**Criterios de aceptación**
- [x] La app se conecta a la base de Docker Compose.
- [x] La configuración funciona tanto sin SSL como con una URL con `sslmode=require` (lo de Neon se verifica en T9.3).
- [x] Con `RUN_MIGRATIONS=true`, al iniciar TypeORM crea su tabla `migrations` y aplica las pendientes. Al reiniciar no las vuelve a aplicar.
- [x] Con `RUN_MIGRATIONS=false`, la app inicia sin aplicar migraciones.
- [x] Sin `RUN_MIGRATIONS`, la app no inicia y el error lo indica.
- [x] Si la base no está disponible, la app falla con un error claro en el log.

### T2.2 — Entidades

**Objetivo:** mapear las tablas existentes sin cambiar el esquema.

**Subtareas**
- [x] Crear entidades `User`, `Instrument`, `Order` y `MarketData` sobre las tablas `users`, `instruments`, `orders` y `marketdata`.
- [x] Usar propiedades en camelCase mapeadas a los nombres reales en minúsculas (ej. `instrumentId` → `instrumentid`, `previousClose` → `previousclose`, `accountNumber` → `accountnumber`).
- [x] Definir en código los valores permitidos de:
  - [x] `side`: BUY, SELL, CASH_IN, CASH_OUT.
  - [x] `type` de orden: MARKET, LIMIT.
  - [x] `status`: NEW, FILLED, REJECTED, CANCELLED.
  - [x] `type` de instrumento: ACCIONES, MONEDA.
- [x] Declarar las relaciones `Order` → `User`, `Order` → `Instrument` y `MarketData` → `Instrument`.

**Criterios de aceptación**
- [x] Leer filas de las cuatro tablas devuelve todas las columnas mapeadas, sin `undefined` por nombres mal escritos.
- [x] Las columnas `NUMERIC` se leen sin pérdida de precisión. La conversión a `number` se hace recién al armar la respuesta.
- [x] Las entidades no provocan ningún cambio de esquema.

---

## Fase 3 — Migraciones de esquema

### T3.1 — Restricciones NOT NULL y CHECK

**Objetivo:** que la base rechace datos incompletos o con valores no permitidos.

**Subtareas**
- [x] NOT NULL en:
  - [x] `users`: `email`, `accountnumber`.
  - [x] `instruments`: `ticker`, `name`, `type`.
  - [x] `orders`: `instrumentid`, `userid`, `side`, `type`, `status`, `size`, `price`, `datetime`.
  - [x] `marketdata`: `instrumentid`, `date`, `close`, `previousclose`.
- [x] CHECK con los valores permitidos en `orders.side`, `orders.type`, `orders.status` e `instruments.type`.
- [x] Escribir un `down` que revierta todo.

**Criterios de aceptación**
- [x] La migración corre sin errores sobre el seed.
- [x] Insertar una orden con `status = 'FILED'`, o sin `userid`, falla en la base.
- [x] `npm run migration:revert` deja el esquema como estaba.

### T3.2 — Unicidad e índices

**Objetivo:** garantizar unicidad donde la lógica la supone y acelerar las consultas frecuentes.

**Subtareas**
- [x] UNIQUE en `instruments.ticker`.
- [x] UNIQUE en `marketdata (instrumentid, date)`. Su índice también sirve para buscar el último precio.
- [x] Índice en `orders (userid, status, instrumentid)`.
- [x] Escribir un `down` que revierta todo.

**Criterios de aceptación**
- [x] La migración corre sin errores sobre el seed.
- [x] Insertar un ticker repetido, o una segunda fila de `marketdata` para el mismo instrumento y día, falla.
- [x] Los índices existen (se ven con `\d orders` y `\d marketdata`).
- [x] `npm run migration:revert` deja el esquema como estaba.

### T3.3 — Extensión `unaccent`

**Objetivo:** permitir búsquedas que ignoren acentos.

**Subtareas**
- [x] `CREATE EXTENSION IF NOT EXISTS unaccent`.
- [x] Escribir un `down` con `DROP EXTENSION IF EXISTS unaccent`.

**Criterios de aceptación**
- [x] `SELECT unaccent('Compañía Río')` devuelve `Compania Rio` en la base de Docker.
- [x] `npm run migration:revert` elimina la extensión.

### T3.4 — Función SQL de posiciones por usuario

**Objetivo:** calcular en Postgres las posiciones de un usuario, incluido el PPC, procesando solo sus órdenes.

**Subtareas**
- [x] Crear una función que reciba el id del usuario (ej. `user_positions(p_user_id)`) y devuelva una fila por instrumento con: id, ticker y nombre del instrumento, cantidad, PPC, último precio, valor de mercado y rendimiento total.
- [x] Usar solo órdenes `FILLED` con `side` BUY o SELL (las de efectivo quedan afuera).
- [x] Implementar el algoritmo del PPC recorriendo las órdenes por `datetime` y `id`.
- [x] Tomar como último precio el `close` de la fila con la `date` más reciente del instrumento.
- [x] Hacer todo el cálculo con `NUMERIC`.
- [x] Excluir posiciones con cantidad 0 y mantener las negativas.
- [x] Escribir un `down` que elimine la función.

**Criterios de aceptación**
- [x] Para el usuario 1 devuelve exactamente PAMP, METR y BMA, con los valores de la tabla de referencia.
- [x] Para los usuarios 2, 3 y 4 no devuelve filas.
- [x] Una posición vendida por completo no aparece. Si después se vuelve a comprar, el PPC es el precio de la nueva compra.
- [x] `npm run migration:revert` elimina la función.

---

## Fase 4 — Piezas transversales

### T4.1 — Filtro global de excepciones

**Objetivo:** que todos los errores tengan el mismo formato, sin exponer detalles internos.

**Subtareas**
- [x] Crear un filtro global que responda siempre con `statusCode`, `message`, `error`, `path` y `timestamp`.
- [x] `message` va en español: un texto, o una lista de textos en los errores de validación.
- [x] `error` lleva el nombre HTTP estándar en inglés (`Bad Request`, `Not Found`, `Conflict`, `Internal Server Error`).
- [x] Mapear errores de Postgres:
  - [x] `23503` (clave foránea) → 404.
  - [x] `23505` (valor duplicado) → 409.
  - [x] `22P02` (formato inválido) → 400.
  - [x] `23514` (CHECK) → 400.
  - [x] `23502` (NOT NULL) → 400.
- [x] Cualquier otro error responde 500 con un mensaje genérico en español, sin SQL ni stack. El detalle se registra con el `Logger`.
- [x] Documentar el formato de error en Swagger.

**Criterios de aceptación**
- [x] Un error tiene esta forma:
  ```json
  {
    "statusCode": 404,
    "message": "Usuario no encontrado",
    "error": "Not Found",
    "path": "/portfolio",
    "timestamp": "2026-11-23T14:00:00.000Z"
  }
  ```
- [x] Los errores de validación de T0.4 salen con el mismo formato.
- [x] Un error de base no mapeado devuelve 500 sin detalles internos y queda registrado en el log.

### T4.2 — Identificación del usuario por header `X-User-Id`

**Objetivo:** resolver el usuario de cada request desde un header, de forma reutilizable.

**Subtareas**
- [x] Crear un mecanismo reutilizable (guard, decorador o pipe) que lea `X-User-Id`.
- [x] Si el header falta, está vacío, o el usuario no existe → 404 "Usuario no encontrado".
- [x] Entregar el usuario resuelto al handler.
- [x] Documentar el header en Swagger en los endpoints que lo usan.

**Criterios de aceptación**
- [x] Se aplica a `GET /portfolio` y `POST /orders`. No se aplica a `GET /instruments` ni a la cancelación.
- [x] Sin header → 404 con el formato de T4.1.
- [x] Con `X-User-Id: 1`, el handler recibe el usuario 1.
- [x] El header se valida antes que el body.

---

## Fase 5 — Saldos y portfolio

### T5.1 — Cálculo de saldos del usuario

**Objetivo:** tener en un solo lugar el cálculo de efectivo y acciones disponibles, para usarlo desde el portfolio y desde las órdenes.

**Subtareas**
- [x] Escribir consultas SQL que devuelvan, para un usuario, el efectivo total, `reservedCash` y `availableCash`, según las fórmulas de referencia.
- [x] Escribir una consulta que devuelva las acciones disponibles para vender de un usuario en un instrumento (cantidad − SELL `NEW`).
- [x] Sumar en Postgres y combinar los resultados en el servicio: con `decimal.js` los valores con decimales y con `number` las cantidades enteras.
- [x] Permitir que estas consultas corran dentro de una transacción en curso (la necesita T7.5).

**Criterios de aceptación**
- [x] Usuario 1: efectivo total `753000`, `reservedCash` `125500`, `availableCash` `627500`.
- [x] Usuarios 2, 3 y 4: todos los saldos en `0`.
- [x] Usuario 1: `40` acciones disponibles de PAMP y `-10` de BMA.
- [x] Las órdenes `REJECTED` y `CANCELLED` no afectan ningún saldo.

### T5.2 — Endpoint `GET /portfolio`

**Objetivo:** devolver el valor total de la cuenta, el efectivo y las posiciones del usuario.

**Subtareas**
- [x] Crear el endpoint, que identifica al usuario con `X-User-Id` (T4.2).
- [x] Usar la función de posiciones (T3.4) y los saldos (T5.1).
- [x] Devolver los montos y precios como strings decimales sin redondear, y las cantidades y rendimientos como `number`.
- [x] Ordenar `positions` alfabéticamente por ticker.
- [x] Documentar en Swagger, en español, con un ejemplo de respuesta.

**Respuesta esperada** (el rendimiento está abreviado en el ejemplo):

```json
{
  "totalValue": "889756",
  "availableCash": "627500",
  "reservedCash": "125500",
  "positions": [
    { "ticker": "BMA", "name": "Banco Macro S.A.", "quantity": -10, "latestPrice": "1502.8", "marketValue": "-15028", "totalReturn": -0.0241558 },
    { "ticker": "METR", "name": "MetroGAS S.A.", "quantity": 500, "latestPrice": "229.5", "marketValue": "114750", "totalReturn": -0.082 },
    { "ticker": "PAMP", "name": "Pampa Holding S.A.", "quantity": 40, "latestPrice": "925.85", "marketValue": "37034", "totalReturn": -0.0044624 }
  ]
}
```

**Criterios de aceptación**
- [x] El usuario 1 recibe los valores de la tabla de referencia.
- [x] ARS nunca aparece en `positions`. El efectivo solo figura en `availableCash` y `reservedCash`.
- [x] Las posiciones con cantidad 0 no aparecen. La de BMA aparece con cantidad `-10`.
- [x] Un usuario sin órdenes recibe `{ "totalValue": "0", "availableCash": "0", "reservedCash": "0", "positions": [] }`.
- [x] Un usuario inexistente, o un header inválido o ausente, responde 404.
- [x] La respuesta no expone datos sensibles (email, número de cuenta) ni ids internos.
- [x] Los montos y precios son strings decimales, sin redondeo. Las cantidades son `number`. El rendimiento es una fracción `number`.
- [x] `totalValue` es igual a `availableCash` + `reservedCash` + Σ `marketValue`.

---

## Fase 6 — Búsqueda de activos

### T6.1 — Endpoint `GET /instruments`

**Objetivo:** buscar activos por ticker o nombre, con ranking y paginación.

**Subtareas**
- [x] Recibir los query params:
  - [x] `q`: opcional.
  - [x] `page`: entero ≥ 1, por defecto `1`.
  - [x] `limit`: entero ≥ 1, por defecto `20`, sin máximo.
- [x] Validarlos con un DTO de query y mensajes en español. Valores inválidos (0, negativos, decimales, texto) → 400.
- [x] Buscar con "contiene" sobre `ticker` o `name`, sin distinguir mayúsculas ni acentos (`unaccent` sobre el texto buscado y sobre la columna).
- [x] Escapar `%`, `_` y `\` del texto del usuario, para que se busquen literalmente.
- [x] Si `q` está vacío o ausente, devolver todos los instrumentos (paginados y ordenados por ticker). Un `q` de un solo carácter hace una búsqueda normal.
- [x] Rankear los resultados en este orden, y alfabéticamente por ticker dentro de cada grupo. Cada instrumento aparece una sola vez, en su mejor grupo.
  1. Ticker exacto.
  2. Ticker que empieza con `q`.
  3. Nombre que empieza con `q`.
  4. `q` aparece en cualquier parte del ticker o del nombre.
- [x] Incluir ARS en los resultados. No hay filtro por tipo.
- [x] Devolver `{ data, meta: { page, limit, total, totalPages } }`. Cada ítem: `{ ticker, name, type }`. Sin resultados, `totalPages` es 1.
- [x] No requerir el header de usuario.
- [x] Documentar en Swagger, en español, con ejemplos.

**Criterios de aceptación**
- [x] `q=ga` devuelve, en este orden: GAMI, GARO, GBAN, CGPA2, DGCU2, GGAL, METR, TGNO4, TGSU2 (`total` 9).
- [x] `q=ggal` y `q=GGAL` devuelven GGAL en primer lugar.
- [x] `q=compania` incluye INTR, y `q=rio` incluye MOLI (Molinos Río de la Plata).
- [x] `q=%` y `q=_` no devuelven resultados (`total` 0).
- [x] `q=ars` devuelve ARS en primer lugar.
- [x] Sin `q`: `total` 66 y `totalPages` 4 (con `limit` 20). `page=4` trae 6 ítems. `page=5` devuelve `data: []` con `meta` correcto.
- [x] Sin `page` ni `limit`, se usan `page=1` y `limit=20`.
- [x] `page=0`, `page=1.5`, `limit=0`, `limit=-5` o `limit=abc` → 400 con mensaje en español.
- [x] Un query param desconocido → 400.

---

## Fase 7 — Órdenes

### T7.1 — `POST /orders`: órdenes MARKET por cantidad

**Objetivo:** crear el endpoint de envío de órdenes con la ejecución inmediata de BUY y SELL MARKET.

**Subtareas**
- [x] Crear `POST /orders`, que identifica al usuario con `X-User-Id` (T4.2).
- [x] Definir el DTO con `ticker` (texto), `side` (BUY, SELL, CASH_IN, CASH_OUT), `type` (MARKET, LIMIT), `size` (entero > 0) y `price` (en MARKET se ignora, sin validarlo). Todos los mensajes en español.
- [x] Buscar el instrumento por `ticker` exacto (distingue mayúsculas). Si no existe → 404 "Instrumento no encontrado".
- [x] BUY/SELL sobre un instrumento de tipo `MONEDA` → 400.
- [x] Usar como precio el último `close`.
- [x] Aplicar las reglas de negocio:
  - [x] Sin datos de mercado → `REJECTED` con `NO_MARKET_DATA` y `price` `0`.
  - [x] BUY con `size × close` > `availableCash` → `REJECTED` con `INSUFFICIENT_FUNDS`.
  - [x] SELL con `size` > acciones disponibles → `REJECTED` con `INSUFFICIENT_SHARES`.
  - [x] Si pasa todas las reglas → `FILLED`.
- [x] Crear el mapa código → mensaje en español para los rechazos.
- [x] Responder 201 con el formato de respuesta de referencia.
- [x] Documentar en Swagger con ejemplos `FILLED` y `REJECTED`.

**Criterios de aceptación**
- [x] Usuario 1, MARKET BUY 10 PAMP → 201 `FILLED` con `price` `925.85`. En una base recién creada, la nueva fila tiene id 12.
- [x] Usuario 1, MARKET SELL 10 PAMP → `FILLED`.
- [x] Usuario 1, MARKET BUY 3000 METR (`688500`, más que los `627500` disponibles aunque menos que los `753000` totales) → `REJECTED` con `INSUFFICIENT_FUNDS`. La fila queda guardada con `size` 3000 y `price` 229.5.
- [x] Usuario 1, MARKET SELL 41 PAMP → `REJECTED` con `INSUFFICIENT_SHARES`.
- [x] MARKET BUY 1 PGR → `REJECTED` con `NO_MARKET_DATA` y `price` `0`.
- [x] `ticker: "pamp"` → 404. BUY con `ticker: "ARS"` → 400.
- [x] La respuesta no incluye `userId` ni `instrumentId`. `rejection` es `null` salvo en `REJECTED`.
- [x] Después de una orden `FILLED`, el portfolio la refleja.

### T7.2 — Órdenes LIMIT

**Objetivo:** aceptar órdenes LIMIT, que quedan en espera y reservan efectivo o acciones.

**Subtareas**
- [x] `price` obligatorio en LIMIT: número > 0 con hasta 2 decimales. Si falta o es inválido → 400.
- [x] Guardar con `price` igual al precio límite y `status` `NEW`, aunque el precio de mercado sea mejor.
- [x] Validar al enviarla: BUY con `size × precio límite` ≤ `availableCash`, SELL con `size` ≤ acciones disponibles. Si no alcanza → `REJECTED`.
- [x] Instrumento sin datos de mercado → `REJECTED` con `NO_MARKET_DATA` y `price` igual al precio límite.
- [x] Confirmar que una BUY `NEW` suma a `reservedCash` y una SELL `NEW` descuenta acciones disponibles.

**Criterios de aceptación**
- [x] Usuario 1, LIMIT BUY 10 PAMP a 900 → `NEW` con `price` 900. `reservedCash` sube `9000` y `availableCash` baja `9000`. 
- [x] LIMIT BUY 10 PAMP a 1000 (por encima del mercado) → `NEW`, no se ejecuta.
- [x] LIMIT BUY 3000 METR a 229.50 → `REJECTED` con `INSUFFICIENT_FUNDS`.
- [x] Dos LIMIT BUY de 2000 METR a 229.50 seguidas → la primera `NEW` y la segunda `REJECTED` (la reserva de la primera deja `168500` disponibles).
- [x] LIMIT SELL 40 PAMP a 1000 → `NEW`. Después, MARKET SELL 1 PAMP → `REJECTED` con `INSUFFICIENT_SHARES`.
- [x] LIMIT BUY 1 PGR a 100 → `REJECTED` con `NO_MARKET_DATA` y `price` 100.
- [x] LIMIT sin `price`, o con `price` 0, negativo o con 3 decimales → 400.

### T7.3 — Órdenes por monto en pesos

**Objetivo:** permitir indicar un monto en pesos en lugar de una cantidad de acciones.

**Subtareas**
- [x] Agregar el campo `amount`: número > 0 con hasta 2 decimales, para BUY y SELL.
- [x] BUY/SELL deben traer exactamente uno de `size` o `amount`. Si no trae ninguno, o trae ambos → 400.
- [x] Calcular `size = floor(amount ÷ precio)`, con el último `close` en MARKET y el precio límite en LIMIT.
- [x] Si el `size` calculado es 0 → `REJECTED` con `AMOUNT_TOO_LOW` y `size` `0`.
- [x] MARKET por monto sobre un instrumento sin datos de mercado → `REJECTED` con `NO_MARKET_DATA`, `size` `0` y `price` `0`.

**Criterios de aceptación**
- [x] MARKET BUY con `amount` 50000 de PAMP → `FILLED` con `size` 54 y `price` 925.85.
- [x] LIMIT BUY con `amount` 50000 de PAMP a 900 → `NEW` con `size` 55.
- [x] Usuario 1, MARKET SELL con `amount` 9000 de PAMP → `FILLED` con `size` 9.
- [x] Usuario 1, MARKET SELL con `amount` 50000 de PAMP (tiene 40) → `REJECTED` con `INSUFFICIENT_SHARES` y `size` 54.
- [x] MARKET BUY con `amount` 500 de PAMP → `REJECTED` con `AMOUNT_TOO_LOW` y `size` 0.
- [x] Usuario 2 (sin efectivo), BUY con `amount` 100 de PAMP → `AMOUNT_TOO_LOW`, no `INSUFFICIENT_FUNDS`.
- [x] MARKET BUY con `amount` 1000 de PGR → `NO_MARKET_DATA` con `size` 0 y `price` 0.
- [x] `size` y `amount` juntos, ninguno de los dos, o `amount` 0, negativo o con 3 decimales → 400.

### T7.4 — Transferencias CASH_IN / CASH_OUT

**Objetivo:** registrar depósitos y extracciones de pesos a través de `POST /orders`.

**Subtareas**
- [x] Exigir `ticker: "ARS"`. Con otro ticker → 400.
- [x] Exigir `type: "MARKET"`. Con LIMIT → 400.
- [x] Exigir `amount`, entero > 0. Si falta o tiene decimales → 400.
- [x] Ignorar `size` y `price` si vienen en el body.
- [x] Guardar con instrumento ARS, `size = amount`, `price` `1` y `type` `MARKET`.
- [x] CASH_IN → `FILLED`.
- [x] CASH_OUT con `amount` > `availableCash` → `REJECTED` con `INSUFFICIENT_FUNDS`. Si no, `FILLED`.

**Criterios de aceptación**
- [x] Usuario 2, CASH_IN de 10000 → `FILLED` con `size` 10000 y `price` 1. Después puede comprar por hasta 10000.
- [x] Usuario 1, CASH_OUT de 627500 → `FILLED`. Después su `availableCash` es 0.
- [x] Usuario 1, CASH_OUT de 700000 (menos que los 753000 totales, más que los 627500 disponibles) → `REJECTED` con `INSUFFICIENT_FUNDS`.
- [x] CASH_IN con `ticker: "PAMP"`, con `type: "LIMIT"`, sin `amount` o con `amount` 100.5 → 400.
- [x] CASH_IN que trae `size` además de `amount` → se ignora `size`.

### T7.5 — Control de concurrencia

**Objetivo:** que dos órdenes simultáneas del mismo usuario no puedan gastar el mismo dinero ni vender las mismas acciones.

**Subtareas**
- [x] Ejecutar todo el envío de una orden (saldos, validaciones de negocio e insert) dentro de una transacción.
- [x] Al comienzo de la transacción, bloquear la fila del usuario con `SELECT ... FOR UPDATE` (en TypeORM, lock `pessimistic_write`).
- [x] Aplicarlo a todas las órdenes que envía el endpoint.

**Criterios de aceptación**
- [x] Usuario 1, dos MARKET BUY simultáneas de 2000 METR (`459000` cada una, juntas superan `627500`) → una `FILLED` y otra `REJECTED` con `INSUFFICIENT_FUNDS`.
- [x] Usuario 1, dos MARKET SELL simultáneas de 30 PAMP (tiene 40) → una `FILLED` y otra `REJECTED` con `INSUFFICIENT_SHARES`.
- [x] Las órdenes simultáneas de usuarios distintos no se bloquean entre sí.
- [x] Si algo falla a mitad de camino, no queda ninguna orden guardada a medias.

### T7.6 — Cancelación de órdenes

**Objetivo:** permitir cancelar órdenes en espera.

**Subtareas**
- [x] Crear `POST /orders/:orderId/cancel`, sin header de usuario y sin verificar a quién pertenece la orden.
- [x] `orderId` no numérico o inexistente → 404 "Orden no encontrada".
- [x] Orden con un estado distinto de `NEW` → 409, con un mensaje en español que indique el estado actual.
- [x] Actualizar de forma atómica (`UPDATE ... WHERE id = ... AND status = 'NEW'`), para que dos cancelaciones simultáneas no se pisen.
- [x] Responder 200 con el formato de orden de referencia, `status: "CANCELLED"` y `rejection: null`.
- [x] Documentar en Swagger.

**Criterios de aceptación**
- [x] Cancelar la orden 5 del seed (LIMIT BUY 50 LOMA, `NEW`) → 200 `CANCELLED`. El `reservedCash` del usuario 1 baja `35500` y su `availableCash` sube `35500`.
- [x] Cancelar la orden 2 (`FILLED`), la 3 (`CANCELLED`) o la 6 (`REJECTED`) → 409.
- [x] `orderId` 999 o `abc` → 404.
- [x] Dos cancelaciones simultáneas de la misma orden → una 200 y otra 409.

---

## Fase 8 — Tests funcionales del envío de órdenes

Todos los tests son HTTP (Vitest + supertest) contra `POST /orders`, sobre una base real en un contenedor.
- **201:** se verifican la respuesta y la fila guardada en `orders`.
- **4xx:** se verifican el formato del error y que la cantidad de órdenes no cambió.

### T8.1 — Infraestructura de tests con Testcontainers

**Objetivo:** que los tests corran contra un Postgres real, descartable y siempre en el estado del seed.

**Subtareas**
- [x] Instalar `@testcontainers/postgresql`.
- [x] Levantar un contenedor `postgres:18` por corrida y cargar `src/database/seed.sql`.
- [x] Crear la app Nest de test apuntando a ese contenedor, con `RUN_MIGRATIONS=true` para que aplique las migraciones al iniciar.
- [x] Antes de cada test, restaurar el seed: vaciar las tablas reiniciando los ids y volver a insertar los datos de `src/database/seed.sql`.
- [x] Configurar Vitest en `test/vitest-e2e.config.mts` (timeouts, setup y teardown) y el script `test:e2e`.
- [x] Crear helpers para enviar órdenes y leer filas de `orders`.
- [x] Detener el contenedor al terminar.

**Criterios de aceptación**
- [x] `npm run test:e2e` corre con Docker abierto, sin `.env` ni otra configuración.
- [x] Cada test arranca exactamente con el seed: la primera orden nueva tiene id 12.
- [x] Los tests nunca tocan la base de Docker Compose ni Neon.
- [x] Sin Docker, los tests fallan con un mensaje claro.

### T8.2 — Tests: órdenes ejecutadas y aceptadas

**Casos**
- [x] MARKET BUY por `size` → `FILLED` con `price` igual al último `close` (PAMP 925.85).
- [x] MARKET SELL por `size` dentro de la tenencia → `FILLED`.
- [x] MARKET BUY por `amount` → `size` redondeado hacia abajo (50000 de PAMP → 54).
- [x] MARKET SELL por `amount` → `size` redondeado hacia abajo (9000 de PAMP → 9).
- [x] LIMIT BUY por `size` → `NEW` con el precio límite.
- [x] LIMIT BUY por `amount` → `size = floor(amount ÷ límite)` (50000 a 900 → 55).
- [x] LIMIT SELL → `NEW`.
- [x] LIMIT BUY con precio por encima del mercado → sigue `NEW`.
- [x] MARKET con `price` en el body → se ignora y se usa el último `close`.
- [x] CASH_IN → `FILLED`, instrumento ARS, `size = amount`, `price` 1.
- [x] CASH_IN con `size` en el body → se ignora.
- [x] CASH_OUT dentro de `availableCash` → `FILLED`.
- [x] Usuario 2: después de un CASH_IN puede comprar.
- [x] `datetime` lo asigna la base: no es nulo y es reciente.
- [x] La respuesta tiene exactamente los campos acordados, sin `userId` ni `instrumentId`, y con `rejection: null`.

**Criterios de aceptación**
- [x] Todos los casos pasan, y cada uno verifica la respuesta y la fila guardada.

### T8.3 — Tests: órdenes rechazadas

En cada caso se espera 201, `status: "REJECTED"`, `rejection` con el código y el mensaje en español, y la fila guardada con el `size` y el `price` esperados.

**Casos**
- [x] BUY por más que `availableCash` → `INSUFFICIENT_FUNDS`.
- [x] BUY que entra en el efectivo total pero no en el disponible, por las órdenes reservadas (3000 METR) → `INSUFFICIENT_FUNDS`.
- [x] LIMIT BUY sin fondos suficientes → `INSUFFICIENT_FUNDS`.
- [x] Dos LIMIT BUY que juntas superan lo disponible → la segunda `REJECTED`.
- [x] Usuario 2, sin efectivo, compra 1 PAMP → `INSUFFICIENT_FUNDS`.
- [x] SELL por más que la tenencia (41 PAMP) → `INSUFFICIENT_SHARES`.
- [x] SELL de un activo que no tiene (usuario 2) → `INSUFFICIENT_SHARES`.
- [x] SELL sobre la posición negativa del seed (BMA, usuario 1) → `INSUFFICIENT_SHARES`.
- [x] SELL bloqueada porque una SELL `NEW` reserva las acciones → `INSUFFICIENT_SHARES`.
- [x] SELL por monto mayor que la tenencia (50000 de PAMP → `size` 54) → `INSUFFICIENT_SHARES`.
- [x] Monto insuficiente (500 de PAMP) → `AMOUNT_TOO_LOW` con `size` 0.
- [x] MARKET sobre PGR y sobre IRCP → `NO_MARKET_DATA` con `price` 0.
- [x] LIMIT sobre PGR → `NO_MARKET_DATA` con `price` igual al límite.
- [x] MARKET por monto sobre PGR → `NO_MARKET_DATA` con `size` 0 y `price` 0.
- [x] CASH_OUT por más que `availableCash` → `INSUFFICIENT_FUNDS`.
- [x] CASH_OUT que entra en el total pero no en el disponible (700000, usuario 1) → `INSUFFICIENT_FUNDS`.
- [x] Prioridad: PGR con monto bajo → `NO_MARKET_DATA`. Usuario 2 con monto bajo → `AMOUNT_TOO_LOW`.
- [x] Una orden `REJECTED` no consume saldo: una orden válida posterior se ejecuta.

**Criterios de aceptación**
- [x] Todos los casos pasan, verificando la respuesta y la fila guardada.

### T8.4 — Tests: validaciones (400) y recursos inexistentes (404)

En cada caso se verifican el código HTTP, el formato del error (`statusCode`, `message` en español, `error` en inglés, `path`, `timestamp`) y que la cantidad de órdenes no cambió.

**Casos 404**
- [x] Sin `X-User-Id`, o con `abc`, `0`, `-1` o `999`.
- [x] Ticker inexistente.
- [x] Ticker en minúsculas (`pamp`).
- [x] Header inválido con body inválido → 404 (el header se valida primero).

**Casos 400**
- [x] JSON mal formado.
- [x] Campo desconocido (ej. `datetime`, `userId`).
- [x] Falta `ticker`, `side` o `type`.
- [x] `side` o `type` con un valor fuera de la lista.
- [x] BUY/SELL sin `size` ni `amount`.
- [x] BUY/SELL con `size` y `amount` a la vez.
- [x] `size` 0, negativo, decimal o texto.
- [x] `amount` 0, negativo, con 3 decimales o texto.
- [x] LIMIT sin `price`, o con `price` 0, negativo o con 3 decimales.
- [x] BUY/SELL sobre ARS.
- [x] CASH_IN/CASH_OUT sobre un ticker distinto de ARS.
- [x] CASH_IN/CASH_OUT con `type` LIMIT.
- [x] CASH_IN/CASH_OUT sin `amount`, o con `amount` decimal.

**Criterios de aceptación**
- [x] Todos los casos pasan y ninguno deja órdenes guardadas.

### T8.5 — Tests: concurrencia

**Casos**
- [x] Dos BUY simultáneas que juntas superan lo disponible → una `FILLED` y otra `REJECTED` con `INSUFFICIENT_FUNDS`.
- [x] Dos SELL simultáneas que juntas superan las acciones → una `FILLED` y otra `REJECTED` con `INSUFFICIENT_SHARES`.
- [x] CASH_OUT y BUY simultáneos que juntos superan lo disponible → uno `FILLED` y otro `REJECTED`.
- [x] Al terminar cada caso, los saldos en la base son consistentes: `availableCash` ≥ 0, y las acciones disponibles de PAMP ≥ 0.

**Criterios de aceptación**
- [x] El suite completo corre varias veces seguidas sin fallas intermitentes.

---

## Fase 9 — Documentación y cierre

### T9.1 — README

**Objetivo:** que cualquier persona pueda levantar, probar y entender el proyecto.

**Subtareas**
- [x] Descripción breve del proyecto.
- [x] Sección de setup y ejecución:
  - [x] Requisitos: Docker Desktop. Node 24 y npm solo para desarrollo local.
  - [x] Qué es Docker Compose, en dos líneas.
  - [x] `docker compose up`, y cómo volver al seed con `docker compose down -v`.
  - [x] Ejecución local con npm contra la base de Docker, con `.env` creado desde `.env.example`.
  - [x] Cómo apuntar a otra base (ej. Neon), y el uso de `RUN_MIGRATIONS` para decidir si se aplican las migraciones sobre ella.
  - [x] Comandos de migraciones.
  - [x] Cómo correr los tests (requiere Docker).
  - [x] URL de Swagger (`/api/docs`).
- [x] Sección de arquitectura:
  - [x] Componentes principales y sus responsabilidades.
  - [x] Flujo de una orden: validación, bloqueo del usuario, saldos, reglas, guardado y respuesta.
  - [x] Esquema de datos y migraciones, incluida la función de posiciones.
  - [x] Cálculo de saldos y del PPC.
  - [x] Formato de errores.
  - [x] Manejo de concurrencia.

**Criterios de aceptación**
- [x] Está escrito en español.
- [x] Una persona sin contexto puede levantar el proyecto y correr los tests siguiendo solo el README.
- [x] No contiene credenciales reales.

### T9.2 — Colección de Postman (recordatorio)

**Objetivo:** recordar armar la colección de Postman. El alcance se define más adelante.

**Subtareas**
- [x] Definir el alcance: endpoints, entorno con `baseUrl` y ejemplos.
- [x] Armar y exportar la colección al repo.

**Criterios de aceptación**
- [ ] La colección cubre todos los endpoints, con descripciones en español.
- [ ] No contiene credenciales.

### T9.3 — Revisión final de la entrega

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