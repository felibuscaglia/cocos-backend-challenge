# CLAUDE.md

Guía para Claude Code en este repositorio.

## Proyecto

Challenge técnico de backend para Cocos Capital: una API REST en NestJS 11 + TypeORM + PostgreSQL 18. La API expone:
- **Portfolio** del usuario: valor total, efectivo y posiciones.
- **Búsqueda de activos**.
- **Envío y cancelación de órdenes** (MARKET, LIMIT, CASH_IN, CASH_OUT).

- Consigna original: `backend-challenge.md`.
- Esquema y datos base: `database.sql`.
- El trabajo avanza tarea por tarea según `docs/TASKS.md`.

## Cómo trabajar con el usuario

- **Respuestas lo más concisas y simples posible.** Ir directo al punto, sin repetir contexto ni agregar secciones o detalles que no se pidieron. Usar tablas o listas solo si hacen la respuesta más corta.
- **El usuario toma todas las decisiones técnicas y desarrolla cada tarea.** No implementar tareas de `docs/TASKS.md`, ni ampliar el alcance de un pedido, sin que lo pida explícitamente.
- **Ante cualquier duda, preguntar antes de decidir.** Esto aplica cuando algo no está definido en `docs/`, cuando es ambiguo o cuando dos documentos se contradicen. Al preguntar:
  - Presentar las opciones con pros y contras.
  - Explicarlas en lenguaje simple, sin asumir conocimientos financieros, con ejemplos numéricos cuando ayuden.
  - Recomendar una opción solo si el usuario lo pide.
- Si una decisión ya tomada parece tener un problema, señalarlo con el motivo, sin cambiarla por cuenta propia.
- Si el usuario cambia una decisión, proponer la actualización de `docs/decisiones/` y `docs/TASKS.md` para que sigan alineados.
- Commits: un commit por tarea, directo a `main`, y solo cuando el usuario lo pida.

## Documentación

Antes de trabajar en un área, leer el documento que corresponda. No hace falta leer todo.

| Documento | Contenido |
|---|---|
| `docs/decisiones/` | Decisiones tomadas y su porqué: `infraestructura.md`, `base-de-datos.md`, `portfolio.md`, `ordenes.md`, `busqueda.md`, `api.md`, `testing.md` |
| `docs/TASKS.md` | Plan por fases, criterios de aceptación de cada tarea y reglas de negocio de referencia (fórmulas, códigos de rechazo, valores esperados del seed) |
| `backend-challenge.md` | Consigna original |

- Prioridad ante un conflicto: lo definido en `docs/` está por encima de cualquier skill o práctica general.
- Al ayudar con una tarea, verificar el trabajo contra sus criterios de aceptación en `docs/TASKS.md`.

## Skills del proyecto

Están en `.claude/skills/`. Se instalaron con el CLI de skills, con las versiones fijadas en `skills-lock.json`, y se restauran con `npx skills experimental_install`. Usarlas cuando la tarea lo amerite:

| Skill | Para qué |
|---|---|
| `nestjs-best-practices` | Código NestJS: módulos, DTOs, validación, filtros de excepciones, configuración, transacciones |
| `postgres-best-practices` | SQL, migraciones, índices, la función de posiciones, bloqueos y concurrencia |
| `typescript-e2e-testing` | Escritura de los tests e2e con Jest y supertest |
| `docker-compose-patterns` | Configuración de Docker Compose |
| `ponytail` | Cambios mínimos y respuestas concisas |

Las decisiones del proyecto mandan sobre las skills. Conflictos conocidos:
- **`nestjs-best-practices`:** incluye reglas de autenticación JWT, rate limiting, caching, microservicios y colas. Están fuera de alcance: no proponerlas salvo que el usuario lo pida. El usuario se identifica con el header `X-User-Id`.
- **`typescript-e2e-testing`:** levanta la base de test con Docker Compose y limpia tablas en cada test. Acá se usa Testcontainers y se restaura el seed completo antes de cada test (`docs/decisiones/testing.md`). Usar la skill para la escritura de los tests, no para la infraestructura.
- **`docker-compose-patterns`:** recomienda el nombre `compose.yaml`, pero `docs/TASKS.md` usa `docker-compose.yml`. Seguir `docs/TASKS.md` salvo que el usuario decida cambiarlo. Las credenciales locales de desarrollo en Compose están permitidas.
- **`ponytail`:** propone tomar "la primera opción que funcione". Cuando la elección no está cubierta por `docs/`, preguntar en lugar de elegir.

## Comandos

- `npm run build`, `npm run lint`, `npm run format`.
- `npm run start:dev`: app en modo watch.
- `npm test`: tests unitarios.
- `npm run test:e2e`: tests e2e. Desde T8.1 requiere Docker abierto (Testcontainers).

Se agregan en tareas futuras:
- `docker compose up`: T1.2.
- `npm run migration:create`, `migration:run` y `migration:revert`: T2.1.

## Particularidades del repo

- **`database.sql` no se edita.** Es la base del esquema y de los datos. Todo cambio de esquema va en una migración de TypeORM, y `synchronize` siempre está en `false`.
- **Las columnas de Postgres están en minúsculas** (`instrumentid`, `userid`, `previousclose`, `accountnumber`), porque `database.sql` no las cita. En las entidades se mapean con `@Column({ name: '...' })`.
- **Las migraciones se aplican solas al iniciar la app** (`migrationsRun: true`). Iniciar la app contra una base aplica las migraciones sobre esa base.
- **No apuntar `DATABASE_URL` a la base hosteada** hasta que Cocos confirme que se pueden aplicar migraciones (T0.1).
- **Credenciales:** la URL de la base hosteada incluye la contraseña y el repo es público. Solo puede estar en `.env`; nunca en código, docs, `.env.example`, colecciones ni mensajes de commit.
- **Montos, saldos y rendimientos se calculan en Postgres con `NUMERIC`,** no con `number` de JavaScript.

## Convenciones

- En inglés: el código (identificadores, archivos, campos de la API).
- En español: README, `docs/`, mensajes de commit, descripciones de Swagger, mensajes de error y de rechazo, y la colección de Postman.
