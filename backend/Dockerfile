# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar package files
COPY package.json package-lock.json ./

# Instalar todas las dependencias (incluyendo devDependencies para build)
RUN npm ci

# Copiar código fuente
COPY . .

# Compilar TypeScript
RUN npm run build

# Runtime stage
FROM node:20-alpine

WORKDIR /app

# Copiar package files
COPY package.json package-lock.json ./

# Instalar solo dependencias de producción
RUN npm ci --only=production

# Copiar binarios compilados desde builder
COPY --from=builder /app/dist ./dist

# tsconfig de runtime: tsconfig-paths/register lo usa para resolver @/* → dist/*
COPY tsconfig.runtime.json ./tsconfig.json

# Usuario no-root para seguridad
USER node

# Puerto
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start: tsconfig-paths/register resuelve los aliases @/... a dist/... en runtime
CMD ["node", "-r", "tsconfig-paths/register", "dist/index.js"]

