# =============================================================================
# Stage 1: build-frontend
# Genera backend/public/app/ (Vite → Express static)
# =============================================================================
FROM node:20-alpine AS build-frontend

WORKDIR /workspace

# Copiar manifests de ambos workspaces para que npm ci resuelva el monorepo
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/
# El backend necesita existir como workspace aunque no instalamos sus deps aquí
COPY backend/package.json ./backend/

# Instalar solo deps del workspace frontend
RUN npm ci --workspace frontend

# Copiar código fuente del frontend
COPY frontend/ ./frontend/

# Build: Vite emite a ../backend/public/app según vite.config.ts build.outDir
RUN npm run --workspace frontend build:panel

# =============================================================================
# Stage 2: build-backend
# Compila TypeScript del backend
# =============================================================================
FROM node:20-alpine AS build-backend

WORKDIR /workspace

COPY backend/package.json backend/package-lock.json* ./
RUN npm ci

COPY backend/ ./

RUN npm run build

# =============================================================================
# Stage 3: runtime
# Imagen final mínima: solo lo necesario para correr
# =============================================================================
FROM node:20-alpine AS runtime

WORKDIR /app

# Deps de producción del backend
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --only=production

# Binarios compilados del backend
COPY --from=build-backend /workspace/dist ./dist

# tsconfig-paths necesita este archivo para resolver @/* → dist/* en runtime
COPY backend/tsconfig.runtime.json ./tsconfig.json

# Panel admin (frontend compilado por stage 1)
COPY --from=build-frontend /workspace/backend/public/app ./public/app

# Usuario no-root
USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => { if (r.statusCode !== 200) throw new Error(r.statusCode) })"

CMD ["node", "-r", "tsconfig-paths/register", "dist/index.js"]
