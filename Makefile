.PHONY: install build build-check run dev pre-commit publish clean db-inspect help

# Install dependencies
install:
	bun install

# Build Tailwind CSS
build-css:
	bun run build:css

# Build standalone binary with bun (builds CSS first)
build: build-css
	bun build --compile --minify ./src/index.ts --outfile ./dist/openprotonsync

# Type-check without emitting files
build-check:
	bun run build:check

# Run directly with bun (one-off commands) - builds first to ensure PATH has latest binary
run: build
	PATH="$(PWD)/dist:$(PATH)" bun src/index.ts $(ARGS)

# Run directly with bun in watch mode (auto-reload on file changes)
dev:
	bun scripts/dev.ts $(ARGS)

# Run pre-commit checks on all files
pre-commit:
	bun run build:check
	bun eslint --fix 'src/**/*.ts'
	bun prettier --write 'src/**/*.ts' '*.json' '*.md'

# Publish to npm
publish:
	bun run build
	bun publish

# Clean build artifacts
clean:
	rm -rf dist

# Open Drizzle Studio to inspect the database
# Checkpoint WAL first to ensure all writes are visible
db-inspect:
	@sqlite3 ~/.local/state/openprotonsync/state.db "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null || true
	bun drizzle-kit studio

# Show available commands
help:
	@echo "Available commands:"
	@echo "  make install      - Install dependencies"
	@echo "  make build        - Build standalone binary with bun"
	@echo "  make build-check  - Type-check without emitting files"
	@echo "  make run ARGS=\"\" - Run directly with bun (one-off commands)"
	@echo "  make dev ARGS=\"\" - Run in watch mode (auto-reload on file changes)"
	@echo "  make pre-commit   - Run pre-commit checks on all files"
	@echo "  make publish      - Publish to npm"
	@echo "  make clean        - Clean build artifacts"
	@echo "  make db-inspect   - Open Drizzle Studio to inspect the database"
	@echo "  make help         - Show this help message"
