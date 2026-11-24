# Decisiones — Base de datos

## TypeORM para el acceso a datos

**Decisión:** el acceso a datos se hace con TypeORM.

**Por qué:** tiene integración oficial con NestJS (`@nestjs/typeorm`), maneja migraciones versionadas y reversibles, y permite ejecutar SQL directo cuando hace falta (la función de posiciones y los cálculos con `NUMERIC`).

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

## Cálculos con `NUMERIC` en Postgres

**Decisión:** los montos, saldos y rendimientos se calculan en Postgres con `NUMERIC`.

**Por qué:** `NUMERIC` es exacto. Los números de JavaScript acumulan errores de redondeo en operaciones con decimales.

**Alternativas descartadas:** una librería decimal en TypeScript, o guardar centavos como enteros. Las dos agregan código para resolver algo que Postgres ya resuelve.

## Fecha de las órdenes desde el reloj de Postgres

**Decisión:** `orders.datetime` lo asigna Postgres (`now()`), nunca el cliente ni la app. La columna se mantiene como `TIMESTAMP`.

**Por qué:** hay un único reloj para todas las órdenes, sin importar en qué máquina corra la app.
