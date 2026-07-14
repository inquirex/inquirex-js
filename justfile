# inquirex-js task runner — powered by bun. Run `just` to list recipes.

# Show available recipes
default:
    @just --list

# Install dependencies with bun
install:
    bun install

# Run the test suite
test:
    bun run test

# Run tests with coverage thresholds
coverage:
    bun run test:coverage

# Type-check without emitting
typecheck:
    bun run typecheck

# Lint sources with Biome
lint:
    bunx biome lint .

# Format sources with Biome (writes changes in place)
format:
    bunx biome format --write .

# Lint + format + organize imports in one pass (writes changes)
check:
    bunx biome check --write .

# Build the IIFE + ESM bundles and type declarations
build:
    bun run build

# Start the Vite dev server
dev:
    bun run dev

# Remove build artifacts and dependencies
clean:
    bun run clean

# Publish the current package version to npm.
# `prepublishOnly` rebuilds and runs the test suite first.
publish:
    npm publish
