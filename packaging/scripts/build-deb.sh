#!/bin/bash
# Build a .deb package
# Required environment variables:
#   VERSION - Package version (e.g., "0.2.1")
#   ARCH - Architecture: "amd64" or "arm64"
#   BINARY_PATH - Path to the binary to package
#
# Optional environment variables:
#   PACKAGE_NAME - Package name (default: "openprotonsync")
#
# Outputs:
#   ${PACKAGE_NAME}_${VERSION}_${ARCH}.deb in current directory

set -euo pipefail

# Validate required environment variables
for var in VERSION ARCH BINARY_PATH; do
	if [[ -z "${!var:-}" ]]; then
		echo "Error: ${var} environment variable is required"
		exit 1
	fi
done

PACKAGE_NAME="${PACKAGE_NAME:-openprotonsync}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGING_DIR="$(dirname "${SCRIPT_DIR}")"
PKG_DIR="deb-${ARCH}"
DEB_FILE="${PACKAGE_NAME}_${VERSION}_${ARCH}.deb"

echo "Building .deb package: ${DEB_FILE}"

# Create package directory structure
mkdir -p "${PKG_DIR}/DEBIAN" "${PKG_DIR}/usr/bin"

# Copy binary
cp "${BINARY_PATH}" "${PKG_DIR}/usr/bin/openprotonsync"
chmod 755 "${PKG_DIR}/usr/bin/openprotonsync"

# Generate control file from template
sed -e "s/{{VERSION}}/${VERSION}/" \
	-e "s/{{ARCH}}/${ARCH}/" \
	-e "s/{{PACKAGE_NAME}}/${PACKAGE_NAME}/" \
	"${PACKAGING_DIR}/deb/control" >"${PKG_DIR}/DEBIAN/control"

# Copy maintainer scripts
cp "${PACKAGING_DIR}/deb/postrm" "${PKG_DIR}/DEBIAN/"
chmod 755 "${PKG_DIR}/DEBIAN/postrm"

# Build the package
dpkg-deb --build "${PKG_DIR}" "${DEB_FILE}"

echo "Successfully built: ${DEB_FILE}"
