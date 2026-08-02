# syntax=docker/dockerfile:1

# --------------------------------------------------------------- build ------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
# The build must not need credentials: it renders nothing at build time.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------------------------------------------------------------- run -------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=4242 \
    HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S highlights && adduser -S highlights -u 1001

# `output: "standalone"` gives us a self-contained server: no node_modules copy.
# Measured result on linux/arm64: 344MB, against ~1.1GB for a naive copy.
COPY --from=build --chown=highlights:highlights /app/.next/standalone ./
COPY --from=build --chown=highlights:highlights /app/.next/static ./.next/static
COPY --from=build --chown=highlights:highlights /app/public ./public

# Snapshot cache lives here; mount a volume so a restart is a warm start.
RUN mkdir -p /app/.cache && chown -R highlights:highlights /app/.cache
VOLUME /app/.cache

USER highlights
EXPOSE 4242

HEALTHCHECK --interval=30s --timeout=4s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4242/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
