# Dependencies stage
FROM oven/bun:1-alpine AS deps

WORKDIR /app

# Copy workspace configuration files
COPY pnpm-workspace.yaml ./
COPY package.json ./

# Copy all package.json files to establish workspace structure
COPY packages/database/package.json ./packages/database/
COPY apps/job-server/package.json ./apps/job-server/
COPY apps/nextjs-app/package.json ./apps/nextjs-app/

# Install dependencies with bun
RUN bun install

# Database build stage
FROM deps AS database-builder

# Copy database source
COPY packages/database ./packages/database

# Build database package
WORKDIR /app/packages/database
RUN bun run build

# Production runtime stage
FROM oven/bun:1-alpine AS runner

# Create a non-root user
RUN addgroup --system --gid 1001 bunjs && \
    adduser --system --uid 1001 jobserver

WORKDIR /app

# Copy package files
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=database-builder /app/packages/database ./packages/database

# Copy job-server source (Bun runs TypeScript directly)
COPY apps/job-server/package.json ./package.json
COPY apps/job-server/src ./src
COPY apps/job-server/tsconfig.json ./tsconfig.json

# Switch to non-root user
USER jobserver

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3005

# Expose port
EXPOSE 3005

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3005/health || exit 1

# Start the application with bun
CMD ["bun", "run", "src/index.ts"]
