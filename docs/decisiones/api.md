# Decisiones — API

## Rutas

**Decisión:** las rutas cuelgan de la raíz, sin prefijo global ni versión:
- `GET /portfolio`
- `GET /instruments`
- `POST /orders`
- `POST /orders/:orderId/cancel`

## Usuario por header `X-User-Id`

**Decisión:** el usuario se identifica con el header `X-User-Id`, solo en los endpoints que lo necesitan (`GET /portfolio` y `POST /orders`). Si el header falta, no es un entero positivo o el usuario no existe, la respuesta es 404.

**Por qué:**
- Así funciona un sistema de autenticación: el usuario sale de un token enviado en los headers, no de la URL ni del body. Mientras no haya autenticación, un header es lo más parecido, y se puede reemplazar por un token sin cambiar las rutas.
- Un id inválido equivale, en la práctica, a un usuario que no existe; por eso responde 404.

**Alternativas descartadas:** el id en la ruta (`/users/:userId/...`) o en el body.

## Validación con class-validator y class-transformer

**Decisión:** los pedidos se validan con DTOs de `class-validator` y `class-transformer`, a través del `ValidationPipe` global. Los mensajes están en español.
- Un campo desconocido responde 400.
- Un campo conocido que no aplica (`price` en MARKET, `size` en una transferencia) se ignora.

**Por qué:** es la integración nativa de NestJS para validar y transformar pedidos de forma declarativa.

## Formato de errores

**Decisión:** el formato por defecto de NestJS (`statusCode`, `message`, `error`) más `path` y `timestamp`.
- `message` va en español.
- `error` es el nombre HTTP estándar en inglés (`Bad Request`, `Not Found`, `Conflict`).
- Los errores de Postgres se traducen:
  - Clave foránea → 404.
  - Valor duplicado → 409.
  - Formato inválido, CHECK o NOT NULL → 400.
  - Cualquier otro error → 500, sin exponer detalles internos.

**Por qué:** es un formato conocido para quien trabaja con NestJS y requiere poco código. Traducir los errores de base evita devolver 500 por problemas que son del pedido.

**Alternativas descartadas:**
- RFC 9457 (Problem Details): es estándar, pero suma campos y URIs de tipo que hay que definir.
- Un formato propio con códigos de error: es una convención más a documentar y mantener.

## Números sin redondeo

**Decisión:** los montos, precios y rendimientos se devuelven como números JSON, sin redondear. Los rendimientos son fracciones (`0.28` = 28%).

**Por qué:** el backend entrega valores; cómo mostrarlos (decimales, porcentaje) lo decide el cliente.

**Alternativas descartadas:** strings con dos decimales. Son exactos, pero obligan al cliente a convertirlos para operar.

## Documentación con Swagger

**Decisión:** la especificación OpenAPI se genera con `@nestjs/swagger`, con la UI en `/api/docs` y los textos en español.

**Por qué:** la documentación sale del propio código y permite probar los endpoints desde el navegador.

## Logger integrado de NestJS

**Decisión:** se usa el `Logger` que trae NestJS.

**Por qué:** alcanza para este proyecto y no suma dependencias.
