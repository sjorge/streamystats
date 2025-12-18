#!/bin/bash
set -e

echo "Running database migrations..."

# Wait for database to be ready
until pg_isready -h vectorchord -p 5432 -U "$POSTGRES_USER" -d "$POSTGRES_DB"; do
  echo "Waiting for database to be ready..."
  sleep 2
done

# Run Drizzle migrations
cd /app/packages/database
npm run db:migrate

echo "Migrations completed successfully!" 