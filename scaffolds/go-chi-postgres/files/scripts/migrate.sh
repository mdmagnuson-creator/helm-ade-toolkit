#!/bin/bash
# Migration script for golang-migrate

set -e

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "Error: DATABASE_URL is not set"
    exit 1
fi

# Run migration command
case "$1" in
    up)
        echo "Running migrations up..."
        migrate -path migrations -database "$DATABASE_URL" up
        ;;
    down)
        echo "Running migrations down..."
        migrate -path migrations -database "$DATABASE_URL" down 1
        ;;
    drop)
        echo "Dropping all tables..."
        migrate -path migrations -database "$DATABASE_URL" drop -f
        ;;
    version)
        migrate -path migrations -database "$DATABASE_URL" version
        ;;
    force)
        if [ -z "$2" ]; then
            echo "Error: Version number required"
            exit 1
        fi
        migrate -path migrations -database "$DATABASE_URL" force "$2"
        ;;
    create)
        if [ -z "$2" ]; then
            echo "Error: Migration name required"
            exit 1
        fi
        migrate create -ext sql -dir migrations -seq "$2"
        ;;
    *)
        echo "Usage: $0 {up|down|drop|version|force <version>|create <name>}"
        exit 1
        ;;
esac
