# Decisiones — Búsqueda de activos

## Un solo parámetro `q`

**Decisión:** la búsqueda recibe un único parámetro `q`, que se compara con el ticker y con el nombre.

**Por qué:** funciona mejor para un buscador: la persona escribe lo que recuerda ("GGAL" o "Galicia") y encuentra coincidencias en cualquiera de los dos campos. Cumple con buscar "por ticker y/o por nombre".

**Alternativas descartadas:** parámetros `ticker` y `name` separados. Sirven para filtros precisos que ningún requisito pide.

## Coincidencia "contiene", sin distinguir mayúsculas ni acentos

**Decisión:** un instrumento coincide si `q` aparece en cualquier parte del ticker o del nombre, sin distinguir mayúsculas ni acentos. `unaccent` se aplica al consultar, tanto al texto buscado como a las columnas.

**Por qué:** "galicia" encuentra "Grupo Financiero Galicia", y "compania" encuentra "Compañía Introductora de Buenos Aires S.A.".

**Alternativas descartadas:**
- "Empieza con": es preciso para tickers, pero "Galicia" no encontraría "Grupo Financiero Galicia".
- Búsqueda aproximada (`pg_trgm`): tolera errores de tipeo, pero los resultados son menos predecibles y funciona mal con consultas de 1 o 2 caracteres.
- Una columna con el nombre normalizado: sería una copia a mantener sincronizada, sin ganancia medible con 66 instrumentos.

## Orden de los resultados

**Decisión:**
1. Ticker exacto.
2. Tickers que empiezan con `q`.
3. Nombres que empiezan con `q`.
4. El resto de las coincidencias.

Dentro de cada grupo, orden alfabético por ticker. Sin `q`, todos los instrumentos ordenados por ticker.

**Por qué:** pone primero lo que la persona busca con más probabilidad. Por ejemplo, buscar "ggal" devuelve GGAL arriba de todo.

## Caracteres especiales

**Decisión:** `%`, `_` y `\` se escapan y se buscan como texto literal.

**Por qué:** en SQL, `%` y `_` son comodines. Sin escaparlos, buscar `_` devolvería todos los instrumentos.

## Consultas vacías y cortas

**Decisión:** una consulta vacía devuelve todos los instrumentos, paginados. Una consulta de un carácter hace una búsqueda normal.

**Por qué:** la paginación mantiene liviana cualquier respuesta, aunque coincidan casi todos los instrumentos.

## ARS incluido en los resultados

**Decisión:** ARS aparece en la búsqueda como cualquier otro instrumento.

**Por qué:** es un instrumento de la tabla, y su ticker es el que se usa para enviar transferencias (CASH_IN y CASH_OUT).

## Último precio y retorno diario

**Decisión:** cada resultado incluye `latestPrice` (el último `close`) y `dailyReturn` = (`close` − `previousClose`) ÷ `previousClose`, como fracción. Ambos son `null` si el instrumento no es de tipo ACCIONES o no tiene datos de mercado.

**Por qué:** la consigna indica calcular el retorno diario con `close` y `previousClose`. PGR e IRCP no tienen datos de mercado, y ARS es la moneda, sin precio de mercado.

## Paginación

**Decisión:** parámetros `page` y `limit`: enteros mayores a 0, por defecto 1 y 20, sin máximo. Los valores inválidos responden 400. La respuesta es `{ data, meta: { page, limit, total, totalPages } }`.

**Por qué:** es el esquema más simple y estándar. Con un catálogo chico y que no cambia, no hace falta un límite máximo ni paginación por cursor.
