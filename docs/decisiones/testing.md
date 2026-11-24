# Decisiones — Testing

## Alcance: test funcional del envío de órdenes

**Decisión:** tests HTTP con supertest contra `POST /orders`, que cubren todos los casos: órdenes aceptadas, órdenes rechazadas, errores 400 y 404, y concurrencia.

**Por qué:** la consigna pide un test funcional sobre el envío de órdenes. Probar por HTTP cubre de punta a punta la validación, los códigos de estado, el formato de errores, el SQL y las transacciones.

**Alternativas descartadas:** tests a nivel de servicio, sin HTTP. Son más rápidos, pero no cubren la validación de los pedidos ni los códigos de estado.

## Base de test con Testcontainers

**Decisión:** cada corrida levanta un contenedor descartable de Postgres 18, carga el seed y las migraciones, corre los tests y elimina el contenedor.

**Por qué:** es automático, parte de una base limpia en cada corrida y usa Postgres real. Como costo, requiere tener Docker abierto y suma unos 5 a 10 segundos por corrida.

**Alternativas descartadas:**
- Una base de test en Docker Compose: hay que levantarla a mano antes de correr los tests.
- Un esquema aparte en la base hosteada: necesita credenciales y red, y comparte la base real.
- pg-mem (Postgres simulado en memoria): no es Postgres real, y no soporta `FOR UPDATE` ni extensiones como `unaccent`.

## Seed restaurado antes de cada test

**Decisión:** antes de cada test se vacían las tablas y se vuelve a cargar el seed, reiniciando los ids.

**Por qué:** cada test arranca exactamente con los mismos datos, sin depender de lo que hicieron los anteriores.

**Alternativas descartadas:**
- Revertir cada test con un rollback: es más rápido, pero no permite probar dos órdenes simultáneas.
- No restaurar: los tests dependerían del orden en que corren, y una falla arrastraría a los siguientes.
