# Node 24 (versión mayor fija) es la misma que se usa en desarrollo; Alpine mantiene la imagen liviana
# Instala todas las dependencias (incluidas las de desarrollo) y compila TypeScript a dist/
FROM node:24-alpine AS build
WORKDIR /app

# Se copian primero solo los manifiestos para que Docker cachee el npm ci hasta que cambien las dependencias
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Solo dependencias de producción y código compilado (sin fuentes TypeScript ni herramientas de desarrollo)
FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

# Corre con el usuario sin privilegios que trae la imagen de Node
USER node

# Puerto de la app: 3000 por defecto, se puede cambiar con --build-arg PORT=... y con PORT en tiempo de ejecución
ARG PORT=3000
ENV PORT=${PORT}
EXPOSE ${PORT}

CMD ["node", "dist/main"]
