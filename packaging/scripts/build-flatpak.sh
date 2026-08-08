#!/bin/bash
set -euo pipefail

# Build Flatpak package for openprotonsync
#
# Required environment variables:
#   VERSION     - Package version (e.g., 1.0.0)
#   ARCH        - Architecture (x86_64 or aarch64)
#   BINARY_PATH - Path to the binary
#   PRERELEASE  - "true" or "false"

# Validate required environment variables
: "${VERSION:?VERSION is required}"
: "${ARCH:?ARCH is required}"
: "${BINARY_PATH:?BINARY_PATH is required}"
: "${PRERELEASE:?PRERELEASE is required}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

APP_ID="io.github.robje007.OpenProtonSync"

# Determine output filename based on prerelease status
if [ "${PRERELEASE}" = "true" ]; then
	OUTPUT_NAME="OpenProtonSync-Prerelease-${VERSION}-${ARCH}.flatpak"
else
	OUTPUT_NAME="OpenProtonSync-${VERSION}-${ARCH}.flatpak"
fi

echo "Building Flatpak: ${OUTPUT_NAME}"

# Create build directory with all required files
BUILD_DIR="flatpak-build-dir"
rm -rf "${BUILD_DIR}" ".flatpak-builder" "flatpak-repo"
mkdir -p "${BUILD_DIR}"

# Copy manifest
cp "${REPO_ROOT}/packaging/flatpak/${APP_ID}.yml.template" "${BUILD_DIR}/${APP_ID}.yml"

# Copy binary
cp "${BINARY_PATH}" "${BUILD_DIR}/openprotonsync"
chmod +x "${BUILD_DIR}/openprotonsync"

# Copy desktop file
cp "${REPO_ROOT}/packaging/flatpak/${APP_ID}.desktop" "${BUILD_DIR}/"

# Copy icon
cp "${REPO_ROOT}/src/dashboard/assets/icon.svg" "${BUILD_DIR}/${APP_ID}.svg"

# Build the flatpak and export to repo in one step
cd "${BUILD_DIR}"
flatpak-builder --force-clean --repo=repo --arch="${ARCH}" build-dir "${APP_ID}.yml"

# Bundle into a single file
flatpak build-bundle repo "../${OUTPUT_NAME}" "${APP_ID}" --arch="${ARCH}"

cd ..

echo "Successfully built: ${OUTPUT_NAME}"
