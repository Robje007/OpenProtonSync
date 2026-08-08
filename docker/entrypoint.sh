#!/bin/bash
set -e

# Ensure persistent and data directories exist
mkdir -p /config/proton-drive-sync /state/proton-drive-sync /data

# Start sync in foreground (no daemon mode)
# Using exec so signals (SIGTERM, SIGINT) go directly to the app
echo "Starting OpenProtonSync..."
exec proton-drive-sync start --no-daemon "$@"
