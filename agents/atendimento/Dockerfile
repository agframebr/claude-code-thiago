FROM oven/bun:1.2-alpine AS base
WORKDIR /app

# ---- Dependencies ----
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# ---- Build / Source ----
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
# google-service-account.json é montado via volume/secret do Coolify
# (NÃO copiar pro image — fica fora do .dockerignore)

EXPOSE 3000

# Healthcheck: bate em /health a cada 30s
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["bun", "run", "src/index.ts"]
