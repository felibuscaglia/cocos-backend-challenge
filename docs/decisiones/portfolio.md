# Decisiones — Portfolio

## Respuesta agrupada por activo

**Decisión:** el portfolio devuelve una lista `positions` con una entrada por activo: `ticker`, `name`, `quantity`, `latestPrice`, `marketValue` y `totalReturn`. Las posiciones vendidas por completo (cantidad 0) no aparecen. Un usuario sin órdenes recibe saldos en 0 y la lista vacía.

**Por qué:** es lo que pide la consigna: cantidad, valor monetario y rendimiento de cada activo. Una posición en 0 no aporta información.

## Cálculo del efectivo

**Decisión:** el efectivo se calcula con todas las órdenes FILLED del usuario: CASH_IN − CASH_OUT − compras + ventas, cada una como `size × price`.

**Por qué:** la consigna pide calcular la tenencia y los pesos disponibles a partir de los movimientos de la tabla `orders`, usando `size`. En las transferencias `price` vale 1, así que `size` es el monto en pesos.

## Las órdenes en espera reservan efectivo y acciones

**Decisión:**
- Cada BUY en estado NEW reserva `size × precio límite`. `availableCash` = efectivo − `reservedCash`.
- Cada SELL en estado NEW reserva sus acciones. Acciones disponibles = acciones en tenencia − acciones en SELL NEW.
- Cancelar una orden NEW libera lo reservado. Una orden REJECTED nunca reserva nada, porque se rechaza en el momento en que se envía.

**Por qué:** evita gastar dos veces el mismo dinero o vender dos veces las mismas acciones. Sin reserva, un usuario con 753000 pesos podría dejar diez compras en espera de 700000 cada una, y todas se aceptarían porque cada una se valida contra el mismo saldo.

## Valor total, efectivo disponible y reservado

**Decisión:** el portfolio muestra `totalValue`, `availableCash` y `reservedCash`, donde `totalValue` = `availableCash` + `reservedCash` + Σ `marketValue`.

**Por qué:** el efectivo reservado sigue siendo del usuario (está apartado, no gastado), así que cuenta en el valor total: dejar una orden LIMIT en espera no cambia lo que vale la cuenta. Mostrarlo aparte explica por qué el disponible es menor que el total.

**Alternativas descartadas:** calcular el valor total solo con el efectivo disponible. La cuenta parecería valer menos cada vez que se deja una orden en espera, aunque no se haya gastado nada.

## Rendimiento contra el precio promedio de compra

**Decisión:** `totalReturn` = (último precio − PPC) ÷ PPC, devuelto como fracción (`0.28` = 28%). El PPC (precio promedio de compra) se calcula recorriendo las compras y ventas FILLED en orden de fecha:
- **Compra:** nuevo PPC = (acciones en tenencia × PPC + acciones compradas × precio) ÷ (acciones en tenencia + acciones compradas). Si la tenencia era 0 o menos, el PPC pasa a ser el precio de la compra.
- **Venta:** bajan las acciones en tenencia y el PPC no cambia.

**Por qué:**
- Es el rendimiento que muestran los brokers argentinos para cada posición, y la consigna pide calcularlo con las órdenes FILLED de cada activo.
- Recorrer las órdenes en orden evita el error del atajo habitual (total gastado ÷ acciones compradas). Por ejemplo, comprar 10 a 100, vender 5 y comprar 5 a 200 da un PPC real de 150, mientras que el atajo da 133.33.
- La fracción se devuelve sin multiplicar por 100 porque el backend entrega valores y el cliente decide cómo mostrarlos.

**Alternativas descartadas:**
- Rendimiento total del activo incluyendo las ventas: (valor actual + cobrado por ventas − pagado) ÷ pagado. Es más simple de calcular, pero no es el número que muestran los brokers y mezcla ganancias de operaciones viejas con la posición actual.
- FIFO (las primeras acciones compradas son las primeras vendidas): se usa sobre todo para impuestos y obliga a emparejar compras con ventas una por una.

## Posiciones calculadas con una función SQL por usuario

**Decisión:** una función de Postgres recibe el id del usuario y devuelve sus posiciones (cantidad, PPC, último precio, valor de mercado y rendimiento). Procesa solo las órdenes de ese usuario, con aritmética `NUMERIC`.

**Por qué:** el PPC requiere recorrer las órdenes en orden de fecha. La función lo hace por usuario, siempre con datos al día y sin duplicar información.

**Alternativas descartadas:**
- Vista materializada: Postgres no la actualiza sola. Habría que refrescarla después de cada orden, y cada refresco recalcula a todos los usuarios y bloquea la vista, así que las órdenes de usuarios distintos terminarían esperándose entre sí.
- Vista regular: el recorrido en orden necesita una consulta recursiva, y Postgres no puede filtrar por usuario antes de ejecutarla. Recalcularía a todos los usuarios en cada pedido.
- Tabla de totales acumulados: crea dos fuentes de verdad que pueden desincronizarse, y suma código en cada camino que ejecuta órdenes.
- Calcular en TypeScript: se perdería la aritmética exacta de `NUMERIC`, salvo que se agregue una librería decimal.
