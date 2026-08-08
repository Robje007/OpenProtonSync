#!/bin/bash
# Build an .rpm package
# Required environment variables:
#   VERSION - Package version (e.g., "0.2.1" or "0.2.1-beta.1")
#   ARCH - Architecture: "x86_64" or "aarch64"
#   BINARY_PATH - Path to the binary to package
#
# Optional environment variables:
#   PACKAGE_NAME - Package name (default: "openprotonsync")
#
# Outputs:
#   ${PACKAGE_NAME}-*.${ARCH}.rpm in current directory

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

# Parse version for RPM (handles pre-release versions like "0.2.1-beta.1")
if [[ "${VERSION}" == *-* ]]; then
	RPM_VERSION="${VERSION%%-*}"
	RPM_RELEASE="0.${VERSION#*-}"
	RPM_RELEASE="${RPM_RELEASE//-/.}"
else
	RPM_VERSION="${VERSION}"
	RPM_RELEASE="1"
fi

echo "Building .rpm package: ${PACKAGE_NAME}-${RPM_VERSION}-${RPM_RELEASE}.${ARCH}.rpm"

# Create rpmbuild directory structure
mkdir -p rpmbuild/{BUILD,RPMS,SOURCES,SPECS,SRPMS}

# Copy binary and spec file
cp "${BINARY_PATH}" rpmbuild/SOURCES/openprotonsync
cp "${PACKAGING_DIR}/rpm/openprotonsync.spec" rpmbuild/SPECS/

# Build the package
rpmbuild --define "_topdir $(pwd)/rpmbuild" \
	--define "_name ${PACKAGE_NAME}" \
	--define "_version ${RPM_VERSION}" \
	--define "_release ${RPM_RELEASE}" \
	--target "${ARCH}" \
	-bb rpmbuild/SPECS/openprotonsync.spec

# Copy to current directory
RPM_FILE=$(find rpmbuild/RPMS/${ARCH}/ -name "*.rpm" | head -1)
cp "${RPM_FILE}" ./

echo "Successfully built: $(basename "${RPM_FILE}")"
