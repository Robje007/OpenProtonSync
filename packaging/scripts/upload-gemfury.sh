#!/bin/bash
# Upload .deb and .rpm packages to Gemfury
# Required environment variables:
#   GEMFURY_TOKEN - Push token for Gemfury
#   PACKAGES_DIR - Directory containing packages to upload
#
# Optional environment variables:
#   GEMFURY_USERNAME - Gemfury username (default: robje007)

set -euo pipefail

GEMFURY_USERNAME="${GEMFURY_USERNAME:-robje007}"

# Validate required environment variables
for var in GEMFURY_TOKEN PACKAGES_DIR; do
	if [[ -z "${!var:-}" ]]; then
		echo "Error: ${var} environment variable is required"
		exit 1
	fi
done

if [[ ! -d "${PACKAGES_DIR}" ]]; then
	echo "Error: PACKAGES_DIR '${PACKAGES_DIR}' does not exist"
	exit 1
fi

# Find all packages
PACKAGES=$(find "${PACKAGES_DIR}" -type f \( -name "*.deb" -o -name "*.rpm" \))

if [[ -z "${PACKAGES}" ]]; then
	echo "Error: No .deb or .rpm packages found in ${PACKAGES_DIR}"
	exit 1
fi

echo "Uploading packages to Gemfury (${GEMFURY_USERNAME})..."

FAILED=0
for pkg in ${PACKAGES}; do
	echo "  Uploading $(basename "${pkg}")..."
	if curl --fail --silent --show-error \
		-F "package=@${pkg}" \
		"https://${GEMFURY_TOKEN}@push.fury.io/${GEMFURY_USERNAME}/"; then
		echo "    Success"
	else
		echo "    Failed to upload $(basename "${pkg}")"
		FAILED=1
	fi
done

if [[ ${FAILED} -eq 1 ]]; then
	echo "Some packages failed to upload"
	exit 1
fi

echo "All packages uploaded successfully"
