# Build stage
FROM oven/bun:1 AS builder
WORKDIR /app

# Copy configuration files
COPY package.json bun.lock ./
COPY packages/database/package.json ./packages/database/
# Create dummy package.json for other workspaces to satisfy bun install
COPY apps/job-server/package.json ./apps/job-server/
RUN mkdir -p apps/nextjs-app && echo '{"name":"@streamystats/nextjs-app","version":"0.0.0","dependencies":{}}' > apps/nextjs-app/package.json

# Install dependencies (we need full install to build)
RUN bun install --frozen-lockfile

# Copy database package source
COPY packages/database ./packages/database

# Build the database package if needed (optional but good for consistency)
WORKDIR /app/packages/database
# RUN bun run build # Skipping build as we compile ts directly

# Compile the migration script to a single binary
# --target=bun-linux-musl-x64 is for Alpine compatibility
RUN bun build ./src/migrate-entrypoint.ts --compile --minify --target=bun-linux-musl-x64 --outfile migrate-bin

# Production runtime stage - Alpine
FROM alpine:latest AS runner

# Install minimal dependencies (ca-certificates for SSL if needed)
RUN apk add --no-cache ca-certificates

WORKDIR /app

# Copy the compiled binary
COPY --from=builder /app/packages/database/migrate-bin ./migrate-bin

# Copy the migration SQL files (CRITICAL: Must be in ./drizzle relative to binary)
COPY --from=builder /app/packages/database/drizzle ./drizzle

ENV NODE_ENV=production

# Run the binary
CMD ["./migrate-bin"]
