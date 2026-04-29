# =============================================================================
# Multi-stage build. Production image contains ONLY dist/ + node_modules.
# src/, tests/, devDependencies are not present, so source is unreachable.
# =============================================================================

# ----- 1. deps -----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN apk add --no-cache python3 make g++ \
 && npm ci --include=dev \
 && apk del python3 make g++

# ----- 2. build -----
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate \
 && npm run build \
 && npm prune --omit=dev

# ----- 3. runtime -----
FROM node:22-alpine AS runtime
WORKDIR /app

# Run as non-root
RUN addgroup -S app && adduser -S app -G app

ENV NODE_ENV=production \
    NODE_OPTIONS=--enable-source-maps

# Copy ONLY runtime artifacts. No src/, no tests/, no tsconfig.
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/package.json ./package.json
COPY --from=build --chown=app:app /app/prisma ./prisma

USER app

EXPOSE 8080

# Default to API process; override CMD to start worker:
#   docker run ... node dist/worker.js
CMD ["node", "dist/index.js"]
