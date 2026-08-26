# syntax=docker/dockerfile:1

# ---- Build ----------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# Erst nur die Manifeste, damit der npm-Layer gecacht bleibt.
# Kein Fallback auf npm install: schlägt npm ci fehl, ist das Lockfile kaputt
# oder unvollständig, und ein stiller Fallback baut dir einen anderen
# Dependency-Tree ins Image, als du getestet hast. Lieber laut scheitern.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# ---- Runtime --------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    NITRO_PORT=3000 \
    NITRO_HOST=0.0.0.0 \
    DATA_DIR=/data

# Nitros .output ist self-contained, node_modules braucht es nicht
COPY --from=build /app/.output ./.output

RUN mkdir -p /data && chown -R node:node /data /app
USER node

EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", ".output/server/index.mjs"]
