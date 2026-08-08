#!/usr/bin/env bash
set -euo pipefail

# Update flake.nix with a new version and SHA-256 hashes from GitHub release artifacts.
#
# Usage:
#   ./packaging/scripts/update-nix-flake.sh <version>
#
# Environment variables:
#   ARTIFACTS_DIR  - Directory containing downloaded release tarballs (default: ./artifacts)
#
# Example:
#   ARTIFACTS_DIR=./artifacts ./packaging/scripts/update-nix-flake.sh 0.2.4

VERSION="${1:?Usage: $0 <version>}"
ARTIFACTS_DIR="${ARTIFACTS_DIR:-./artifacts}"
FLAKE_FILE="flake.nix"

if [ ! -f "$FLAKE_FILE" ]; then
	echo "Error: $FLAKE_FILE not found. Run this script from the repository root."
	exit 1
fi

# Compute SRI hash (sha256-<base64>) for a file.
sri_hash() {
	local file="$1"
	if [ ! -f "$file" ]; then
		echo "Error: artifact not found: $file" >&2
		exit 1
	fi
	local raw_hash
	raw_hash=$(sha256sum "$file" | awk '{print $1}' | xxd -r -p | base64 -w0)
	echo "sha256-${raw_hash}"
}

echo "Computing hashes for v${VERSION}..."

HASH_LINUX_X64=$(sri_hash "${ARTIFACTS_DIR}/openprotonsync-linux-x64.tar.gz")
HASH_LINUX_ARM64=$(sri_hash "${ARTIFACTS_DIR}/openprotonsync-linux-arm64.tar.gz")
HASH_DARWIN_ARM64=$(sri_hash "${ARTIFACTS_DIR}/openprotonsync-darwin-arm64.tar.gz")
HASH_DARWIN_X64=$(sri_hash "${ARTIFACTS_DIR}/openprotonsync-darwin-x64.tar.gz")

echo "  x86_64-linux:   ${HASH_LINUX_X64}"
echo "  aarch64-linux:  ${HASH_LINUX_ARM64}"
echo "  aarch64-darwin: ${HASH_DARWIN_ARM64}"
echo "  x86_64-darwin:  ${HASH_DARWIN_X64}"

echo "Updating ${FLAKE_FILE}..."

# Update version
sed -i "s|version = \"[^\"]*\";|version = \"${VERSION}\";|" "$FLAKE_FILE"

# Update hashes
sed -i "s|x86_64-linux = \"sha256-[^\"]*\";|x86_64-linux = \"${HASH_LINUX_X64}\";|" "$FLAKE_FILE"
sed -i "s|aarch64-linux = \"sha256-[^\"]*\";|aarch64-linux = \"${HASH_LINUX_ARM64}\";|" "$FLAKE_FILE"
sed -i "s|aarch64-darwin = \"sha256-[^\"]*\";|aarch64-darwin = \"${HASH_DARWIN_ARM64}\";|" "$FLAKE_FILE"
sed -i "s|x86_64-darwin = \"sha256-[^\"]*\";|x86_64-darwin = \"${HASH_DARWIN_X64}\";|" "$FLAKE_FILE"

echo "Done. Updated ${FLAKE_FILE} to v${VERSION}."
