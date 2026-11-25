# Decisiones — Base de datos

## TypeORM para el acceso a datos

**Decisión:** el acceso a datos se hace con TypeORM.

**Por qué:** tiene integración oficial con NestJS (`@nestjs/typeorm`), maneja migraciones versionadas y reversibles, y permite ejecutar SQL directo cuando hace falta (la función de posiciones y los cálculos con `NUMERIC`).

## Repositorios para las consultas, servicios para la lógica de negocio

**Decisión:** el acceso a datos se separa de la lógica de negocio. Cada entidad que se consulta tiene un repositorio propio (ej. `UsersRepository`) con métodos concretos (`findById`), que envuelve el `Repository` de TypeORM. Los servicios solo tienen lógica de negocio y usan los repositorios para leer y escribir.

**Por qué:** cada consulta queda en un único lugar con un nombre que dice qué hace, y los servicios no dependen de cómo se arma la consulta.

**Alternativas descartadas:** inyectar el `Repository` de TypeORM directamente en los servicios. Es menos código, pero mezcla las consultas con la lógica de negocio.

## `database.sql` como base y migraciones encima

**Decisión:** el esquema y los datos de `database.sql` se mantienen tal cual, y cada cambio se hace con una migración de TypeORM. `synchronize` está desactivado: TypeORM nunca modifica el esquema por su cuenta.

**Por qué:** respeta el modelo provisto por Cocos y deja cada cambio versionado, reversible y justificado.

**Alternativas descartadas:** reescribir todo el esquema en migraciones. Duplica `database.sql` y se aleja del modelo provisto.

## Columnas obligatorias (NOT NULL)

**Decisión:** NOT NULL en:
- `users`: `email`, `accountnumber`.
- `instruments`: `ticker`, `name`, `type`.
- `orders`: `instrumentid`, `userid`, `side`, `type`, `status`, `size`, `price`, `datetime`.
- `marketdata`: `instrumentid`, `date`, `close`, `previousclose`.

`marketdata.open`, `high` y `low` siguen siendo opcionales.

**Por qué:** en el modelo original todas las columnas aceptan valores vacíos, y una orden sin usuario, cantidad o side rompería los cálculos.
- `open`, `high` y `low` quedan opcionales porque DOME y POLL los tienen vacíos en el seed y la app no los usa.
- `orders.price` puede ser obligatorio porque, cuando no hay precio, se guarda `0`.

## Valores permitidos con CHECK

**Decisión:** restricciones CHECK sobre:
- `orders.side`: BUY, SELL, CASH_IN, CASH_OUT.
- `orders.type`: MARKET, LIMIT.
- `orders.status`: NEW, FILLED, REJECTED, CANCELLED.
- `instruments.type`: ACCIONES, MONEDA.

**Por qué:** estas columnas eran texto libre. Un error como `'FILED'` quedaría guardado, y todos los cálculos que buscan `'FILLED'` lo ignorarían en silencio. La validación de la API ya bloquea valores inválidos; el CHECK protege contra todo lo demás (SQL manual, errores de código).

**Alternativas descartadas:** enums de Postgres. Agregar un valor requiere una migración en los dos casos, pero con CHECK es más simple quitar o renombrar valores. Se eligió CHECK anticipando que puedan sumarse tipos o estados nuevos.

## Ticker único

**Decisión:** UNIQUE en `instruments.ticker`.

**Por qué:** las órdenes identifican el instrumento por ticker y la búsqueda pone primero la coincidencia exacta de ticker. Las dos cosas suponen un solo instrumento por ticker.

## Un precio por instrumento y día

**Decisión:** UNIQUE en `marketdata (instrumentid, date)`.

**Por qué:** el "último cierre" supone una sola fila por instrumento y día. Además, el índice que crea esta restricción vuelve directa la búsqueda del último `close`, que hacen el portfolio, la búsqueda de activos y cada orden MARKET. Como la app nunca escribe en `marketdata`, el costo es prácticamente nulo.

**Alternativas descartadas:** un índice aparte sobre `(instrumentid, date DESC)`. Sería redundante, porque Postgres puede recorrer el índice de la restricción en orden inverso.

## Índice de órdenes por usuario, estado e instrumento

**Decisión:** índice en `orders (userid, status, instrumentid)`.

**Por qué:** cada pedido de portfolio, cada cálculo de saldo y cada envío de orden filtran las órdenes por usuario y estado, y por instrumento al validar una venta. Enviar una orden implica leer los saldos antes de guardarla, así que el índice también acelera las escrituras. Su costo es un paso extra pequeño en cada insert.

## Sin índice de búsqueda en `instruments`

**Decisión:** no se agrega un índice para la búsqueda por texto.

**Por qué:** con 66 instrumentos, Postgres recorre la tabla más rápido de lo que tardaría en usar un índice. Un índice trigram (`pg_trgm`) solo tendría sentido con un catálogo mucho más grande.

## Extensión `unaccent`

**Decisión:** se habilita la extensión `unaccent` con una migración.

**Por qué:** permite que la búsqueda ignore acentos ("compania" encuentra "Compañía", "rio" encuentra "Río"). Está disponible en la imagen oficial de Postgres y en la base hosteada.

## Cálculos con `NUMERIC` en Postgres y `decimal.js` en el servicio

**Decisión:** las sumas sobre las filas se hacen en Postgres, en consultas simples del repositorio. Combinar esos resultados en el servicio depende del tipo de valor:
- **Valores con decimales** (montos, saldos en pesos, rendimientos): con `decimal.js`, nunca con `number` de JavaScript. Viajan entre capas como strings.
- **Cantidades enteras** (acciones): con `number`, convirtiendo con `Number()` el string que devuelve Postgres para un `SUM` (`BIGINT`).

**Por qué:** `NUMERIC` y `decimal.js` son exactos; los números de JavaScript acumulan errores de redondeo con decimales (`0.1 + 0.2 = 0.30000000000000004`). Con enteros, `number` es exacto hasta `Number.MAX_SAFE_INTEGER` (unos 9 mil billones), así que `decimal.js` no aporta nada. Las reglas de negocio (qué órdenes cuentan y con qué signo) quedan en el servicio, y no en SQL ni en funciones de la base.

**Alternativas descartadas:**
- Hacer todo el cálculo en Postgres, en la consulta del repositorio o en una función SQL: es exacto sin dependencias, pero deja reglas de negocio en la base.
- Restar montos con decimales con `number` en el servicio: posibles errores de redondeo.
- Guardar centavos como enteros: cambia el esquema de `database.sql`.

## Fecha de las órdenes desde el reloj de Postgres

**Decisión:** `orders.datetime` lo asigna Postgres (`now()`), nunca el cliente ni la app. La columna se mantiene como `TIMESTAMP`.

**Por qué:** hay un único reloj para todas las órdenes, sin importar en qué máquina corra la app.
