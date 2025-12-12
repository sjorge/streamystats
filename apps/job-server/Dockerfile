# Dependencies stage - Only job-server deps
FROM oven/bun:1-alpine AS deps

WORKDIR /app

# Create minimal workspace structure
COPY package.json bun.lock ./
COPY packages/database/package.json ./packages/database/
COPY apps/job-server/package.json ./apps/job-server/

# Create empty nextjs-app package.json to satisfy workspace but skip its deps
RUN mkdir -p apps/nextjs-app && echo '{"name":"@streamystats/nextjs-app","version":"0.0.0","dependencies":{}}' > apps/nextjs-app/package.json

# Install dependencies - this will only install job-server + database deps now
RUN bun install --frozen-lockfile || bun install

# Database build stage
FROM deps AS database-builder

COPY packages/database ./packages/database

WORKDIR /app/packages/database
RUN bun run build

# Production runtime stage
FROM oven/bun:1-alpine AS runner

RUN apk add --no-cache libc6-compat wget

RUN addgroup --system --gid 1001 bunjs && \
    adduser --system --uid 1001 jobserver

WORKDIR /app

# Copy node_modules (now much smaller without nextjs deps)
COPY --from=deps /app/node_modules ./node_modules
COPY --from=database-builder /app/packages/database ./packages/database

# Copy job-server source
COPY apps/job-server/package.json ./package.json
COPY apps/job-server/src ./src
COPY apps/job-server/tsconfig.json ./tsconfig.json

USER jobserver

ENV NODE_ENV=production
ENV PORT=3005
ENV HOST=0.0.0.0

EXPOSE 3005

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3005/health || exit 1

CMD ["bun", "run", "src/index.ts"]
