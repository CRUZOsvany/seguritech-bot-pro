# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar package files
COPY package.json package-lock.json ./

# Instalar dependencias
RUN npm ci

# Copiar código
COPY . .

# Stub vars para que `next build` no falle al "collect page data".
# NEXT_PUBLIC_* se inlinean en el bundle del cliente: para prod, rebuild con valores reales.
ARG NEXT_PUBLIC_SUPABASE_URL=https://build-stub.supabase.co
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.build-stub
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

# Build Next.js
RUN npm run build

# Runtime stage
FROM node:20-alpine

WORKDIR /app

# Copiar package files
COPY package.json package-lock.json ./

# Instalar solo dependencias de producción
RUN npm ci --only=production

# Copiar .next desde builder
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# Usuario no-root
USER node

# Puerto
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start
CMD ["npm", "start"]

