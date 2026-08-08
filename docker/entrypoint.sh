#!/bin/bash
set -e

# Ensure persistent and data directories exist
mkdir -p /config/openprotonsync /state/openprotonsync /data

# Start sync in foreground (no daemon mode)
# Using exec so signals (SIGTERM, SIGINT) go directly to the app
echo "Starting OpenProtonSync..."
exec openprotonsync start --no-daemon "$@"
