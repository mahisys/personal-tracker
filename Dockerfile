# syntax=docker/dockerfile:1.7
# Command Center — production image for Cloud Run.

FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:24-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx next build \
 && npx esbuild scripts/migrate.mts --bundle --platform=node --format=esm --target=node24 \
      --outfile=dist/migrate.mjs \
      --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);"

FROM node:24-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0 \
    MIGRATIONS_DIR=/app/drizzle
RUN groupadd -r app && useradd -r -g app app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/drizzle ./drizzle
COPY --from=build --chown=app:app /app/dist ./dist
USER app
EXPOSE 8080
# Apply migrations + seed, then start the server.
CMD ["sh", "-c", "node dist/migrate.mjs && exec node server.js"]
