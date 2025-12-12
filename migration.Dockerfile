# Migration container (Bun workspace)
FROM oven/bun:1-alpine AS runner

RUN apk add --no-cache libc6-compat postgresql-client

WORKDIR /app

# Install workspace deps (including drizzle-kit from packages/database devDependencies)
COPY package.json bun.lock* ./
COPY packages/database/package.json ./packages/database/
RUN bun install --frozen-lockfile || bun install

# Copy database package (drizzle config references ./src/schema.ts)
COPY packages/database ./packages/database

# Create migration script
COPY <<'MIGRATION_SCRIPT' /app/run-migrations.sh
#!/bin/sh
set -e

echo "=== Database Migration Script ==="
echo "Starting at: $(date)"

wait_for_postgres() {
  echo "Waiting for PostgreSQL to be ready..."
  until pg_isready -h "${DB_HOST:-vectorchord}" -p "${DB_PORT:-5432}" -U "${POSTGRES_USER:-postgres}"; do
    echo "PostgreSQL is not ready yet. Waiting..."
    sleep 2
  done
  echo "PostgreSQL is ready!"
}

check_database() {
  echo "Checking if database '${POSTGRES_DB:-streamystats}' exists..."
  if psql -h "${DB_HOST:-vectorchord}" -U "${POSTGRES_USER:-postgres}" -lqt | cut -d'|' -f1 | grep -qw "${POSTGRES_DB:-streamystats}"; then
    echo "Database '${POSTGRES_DB:-streamystats}' exists."
    return 0
  fi
  echo "Database '${POSTGRES_DB:-streamystats}' does not exist."
  return 1
}

create_database() {
  echo "Creating database '${POSTGRES_DB:-streamystats}'..."
  createdb -h "${DB_HOST:-vectorchord}" -U "${POSTGRES_USER:-postgres}" "${POSTGRES_DB:-streamystats}"
  echo "Database '${POSTGRES_DB:-streamystats}' created successfully!"
}

create_extensions() {
  echo "Creating required PostgreSQL extensions..."

  psql -h "${DB_HOST:-vectorchord}" -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-streamystats}" \
    -c "CREATE EXTENSION IF NOT EXISTS vector;" || echo "Warning: Failed to create vector extension"

  psql -h "${DB_HOST:-vectorchord}" -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-streamystats}" \
    -c 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";' || echo "Warning: Failed to create uuid-ossp extension"

  echo "Extensions created."
}

main() {
  if [ -n "$DATABASE_URL" ]; then
    export PGPASSWORD=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
    export POSTGRES_USER=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
    export DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
    export DB_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
    export POSTGRES_DB=$(echo "$DATABASE_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')
  fi

  export DB_HOST="${DB_HOST:-vectorchord}"
  export DB_PORT="${DB_PORT:-5432}"
  export POSTGRES_USER="${POSTGRES_USER:-postgres}"
  export POSTGRES_DB="${POSTGRES_DB:-streamystats}"
  export PGPASSWORD="${PGPASSWORD:-${POSTGRES_PASSWORD:-postgres}}"

  echo "Configuration:"
  echo "  Host: $DB_HOST"
  echo "  Port: $DB_PORT"
  echo "  User: $POSTGRES_USER"
  echo "  Database: $POSTGRES_DB"

  wait_for_postgres

  if ! check_database; then
    create_database
  fi

  create_extensions

  echo "Running database migrations with Drizzle..."
  cd /app/packages/database && bun run db:migrate

  echo "Migrations completed successfully!"
  echo "=== Migration script finished at: $(date) ==="
}

main
MIGRATION_SCRIPT

RUN chmod +x /app/run-migrations.sh

ENV NODE_ENV=production

CMD ["/app/run-migrations.sh"]