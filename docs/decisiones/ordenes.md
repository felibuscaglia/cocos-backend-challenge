# Decisiones — Órdenes

## Error 4xx vs orden REJECTED

**Decisión:**
- **4xx (no se guarda nada):** el pedido está mal formado o apunta a algo que no existe.
  - 400: body mal formado, campos desconocidos, LIMIT sin precio, valores cero o negativos, `size` y `amount` a la vez, BUY/SELL sobre un instrumento de tipo MONEDA, CASH_IN/CASH_OUT sobre un ticker distinto de ARS o con tipo LIMIT.
  - 404: usuario o instrumento inexistente.
- **201 con `REJECTED` (la orden se guarda):** el pedido es válido, pero la orden no puede ejecutarse desde el punto de vista del producto: el monto en pesos no alcanza para una acción, el efectivo o las acciones no alcanzan, o el instrumento no tiene datos de mercado.

**Por qué:** separa los errores del cliente, que no deben dejar rastro, de los rechazos de negocio, que la consigna pide guardar con estado REJECTED.

## Rechazo con 201 y motivo en la respuesta

**Decisión:** una orden rechazada responde 201 con `status: "REJECTED"` y `rejection: { code, message }`. El mensaje, en español, sale de un mapa código → mensaje en la app. El motivo no se guarda en la base.

**Por qué:**
- La orden sí se creó (queda guardada). El rechazo es un resultado válido de negocio, no un error del pedido.
- El código permite que un cliente reaccione sin interpretar texto.
- El motivo no se guarda porque ningún endpoint lista órdenes: en la base solo sería visible consultándola a mano.

## Códigos de rechazo y prioridad

**Decisión:**

| Prioridad | Código | Cuándo |
|---|---|---|
| 1 | `NO_MARKET_DATA` | El instrumento no tiene datos de mercado |
| 2 | `AMOUNT_TOO_LOW` | El monto en pesos no alcanza para una acción entera |
| 3 | `INSUFFICIENT_FUNDS` | Una compra o un CASH_OUT supera el efectivo disponible |
| 3 | `INSUFFICIENT_SHARES` | Una venta supera las acciones disponibles |

**Por qué:** si una orden incumple varias reglas, siempre se informa un único motivo, y siempre el mismo. Así las respuestas son predecibles y se pueden testear.

## Orden de validación

**Decisión:**
1. Usuario (header `X-User-Id`) → 404.
2. Formato del body → 400.
3. Existencia del ticker → 404.
4. Reglas que dependen del instrumento → 400.
5. Reglas de negocio → 201 con `REJECTED`.

**Por qué:** las respuestas son deterministas aunque un pedido tenga varios problemas a la vez. El usuario se valida primero, como lo haría una autenticación.

## Órdenes MARKET

**Decisión:** se ejecutan al último `close` del instrumento. Si el pedido trae `price`, se ignora.

**Por qué:** la consigna indica usar el último precio (`close`) para las órdenes MARKET. Un `price` enviado no cambia el resultado, así que se ignora en lugar de rechazar el pedido.

## Órdenes LIMIT

**Decisión:** se guardan como NEW al precio límite, aunque el precio de mercado ya sea mejor. Al enviarlas se valida el efectivo disponible (compras) y las acciones disponibles (ventas). Si no alcanzan, la orden queda REJECTED.

**Por qué:** la consigna indica que una orden LIMIT se envía con estado NEW y que no hace falta simular el mercado. La validación aplica la misma regla que en MARKET: se rechazan las órdenes por montos mayores a lo disponible.

## Instrumentos que se pueden comprar y vender

**Decisión:** BUY/SELL sobre un instrumento de tipo MONEDA responde 400.

**Por qué:** el efectivo (ARS) está modelado como un instrumento, pero comprar o vender pesos con pesos no tiene sentido. Los movimientos de pesos son CASH_IN y CASH_OUT.

## Instrumentos sin datos de mercado

**Decisión:** las órdenes sobre instrumentos sin datos de mercado (PGR, IRCP) quedan REJECTED con `NO_MARKET_DATA`, tanto MARKET como LIMIT. En MARKET se guarda `price` 0; en LIMIT, el precio límite.

**Por qué:** sin datos de mercado, el instrumento se considera no operable. Una orden MARKET no tiene precio de ejecución, y una LIMIT quedaría esperando un precio que nunca se publica.

## Órdenes por monto en pesos

**Decisión:** BUY y SELL aceptan `size` (cantidad de acciones) o `amount` (monto en pesos, mayor a 0 y con hasta 2 decimales), y exactamente uno de los dos.
- Con `amount`, `size = floor(amount ÷ precio)`, usando el último `close` en MARKET y el precio límite en LIMIT.
- Si el resultado es 0, la orden queda REJECTED con `AMOUNT_TOO_LOW`.

**Por qué:** la consigna permite enviar un monto total y calcular la máxima cantidad de acciones, sin fracciones.

## Valores guardados cuando no se pueden calcular

**Decisión:** si la cantidad no se puede calcular, se guarda `size` 0. Si una orden MARKET no tiene precio, se guarda `price` 0.

**Por qué:** la orden rechazada queda registrada igual, y las columnas pueden seguir siendo obligatorias.

## Transferencias a través de `POST /orders`

**Decisión:** CASH_IN y CASH_OUT se envían a `POST /orders` con `ticker: "ARS"`, `type: "MARKET"` y el monto en `amount` (`size` y `price` se ignoran). Se guardan con `size = amount` y `price = 1`. CASH_IN queda FILLED. CASH_OUT se valida contra `availableCash`; si no alcanza, queda REJECTED con `INSUFFICIENT_FUNDS`.

**Por qué se consideró un endpoint aparte:** depositar o retirar pesos es una operación distinta de comprar o vender: no tiene precio de mercado, tipo MARKET/LIMIT ni cantidad de acciones. Un endpoint propio (por ejemplo, `POST /transfers` con `{ side, amount }`) tendría un contrato más simple y explícito.

**Por qué se descartó:** la consigna modela las transferencias como órdenes: CASH_IN y CASH_OUT viven en la tabla `orders`, y de ahí sale el cálculo del efectivo. Un solo endpoint mantiene un único flujo de validación, un único bloqueo por usuario y una sola batería de tests. Un segundo endpoint duplicaría esa lógica o sería apenas un envoltorio de la misma.

## Transferencias solo por montos enteros

**Decisión:** depósitos y extracciones aceptan solo pesos enteros. Un monto con decimales responde 400.

**Por qué:** `orders.size` es un entero, y una transferencia se guarda como `size` pesos a precio 1. Permitir centavos obligaría a cambiar `size` a decimal, lo que también aflojaría la regla de que las acciones no se fraccionan.

## Ticker exacto

**Decisión:** el `ticker` de una orden debe coincidir exactamente con el de la base, mayúsculas incluidas. Por ejemplo, `pamp` responde 404.

**Por qué:** una orden tiene que identificar el instrumento sin ambigüedad. La búsqueda, en cambio, ignora mayúsculas y acentos porque sirve para explorar.

## Cancelación

**Decisión:** las órdenes se cancelan con `POST /orders/:orderId/cancel`.
- Solo se cancelan órdenes NEW. Cualquier otro estado responde 409, y una orden inexistente, 404.
- No se verifica a quién pertenece la orden.
- La actualización es atómica (`UPDATE ... WHERE status = 'NEW'`), así que dos cancelaciones simultáneas no se pisan.

**Por qué:**
- Cancelar es una acción (un cambio de estado de NEW a CANCELLED), no una edición libre ni un borrado.
- 409 indica un conflicto con el estado actual de la orden.
- No se verifica el dueño porque la consigna no requiere autenticación y la cancelación no depende de los saldos del usuario.

**Alternativas descartadas:**
- `DELETE /orders/:id`: sugiere que la orden desaparece, pero la fila queda con estado CANCELLED.
- `PATCH /orders/:id` con `{ status }`: sugiere que se puede pasar a cualquier estado, y obliga a bloquear todos menos CANCELLED.

## Concurrencia: bloqueo de la fila del usuario

**Decisión:** cada envío de orden corre en una transacción que primero bloquea la fila del usuario (`SELECT ... FOR UPDATE`). Si llega un segundo pedido del mismo usuario, espera a que termine el primero y después ve el saldo actualizado.

**Por qué:** sin bloqueo, si un usuario tiene 100000 pesos y llegan a la vez dos compras de 80000 (un doble clic o dos dispositivos), las dos leen "100000 disponibles", las dos pasan y las dos se guardan como FILLED: se gastan 160000. Con el bloqueo, la segunda queda REJECTED. Solo se bloquean pedidos del mismo usuario.

**Alternativas descartadas:**
- Advisory lock por usuario: es menos conocido y menos legible, y detrás de un pooler de conexiones solo funciona su variante transaccional.
- Transacciones SERIALIZABLE con reintentos: requieren lógica de reintento y pueden abortar transacciones que no chocaban de verdad.
- No hacer nada: deja abierta la posibilidad de gastar dinero que no existe.
