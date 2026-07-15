# inquirex-js task runner — powered by bun. Run `just` to list recipes.

version := `jq .version < package.json | tr -d '"'`
repo    := "https://github.com/inquirex/inquirex-js"

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

# Dry-run the release: build, test, and pack — without touching the registry
publish-dry:
    bun publish --dry-run

# Bump version in package.json + create a git tag (patch|minor|major|<version>)
version increment="patch":
    bun pm version {{ increment }}

# Print the npm account that `just publish` would publish as
whoami:
    @npm whoami

# Publish to npm, logging in first if needed (2FA: `just publish 123456`)
publish otp="":
    #!/usr/bin/env bash
    set -euo pipefail

    # bun has no `login` command of its own, so we authenticate with npm, which
    # writes the token to ~/.npmrc — exactly where `bun publish` reads it from.
    # `npm whoami` is the cheapest way to prove the stored token is still valid:
    # a stale ~/.npmrc entry looks present but returns 401.
    if npm whoami >/dev/null 2>&1; then
      echo "npm: authenticated as $(npm whoami)"
    else
      echo "npm: not authenticated — starting login…"
      npm login
      if ! npm whoami >/dev/null 2>&1; then
        echo "npm: login did not complete; aborting publish." >&2
        exit 1
      fi
      echo "npm: authenticated as $(npm whoami)"
    fi

    # `prepublishOnly` rebuilds and runs the full test suite before packing.
    if [ -n "{{ otp }}" ]; then
      bun publish --otp "{{ otp }}"
    else
      bun publish
    fi

# Tag v{{ version }}, publish the GH release, & refresh the Homebrew tap.
release:
    git fetch --tags
    git tag -f "v{{ version }}"
    git push -f --tags
    gh release delete -y "v{{ version }}" --repo {{ repo }} 2>/dev/null || true
    gh release create "v{{ version }}" --generate-notes --repo {{ repo }}
