# inquirex-widget task runner — powered by bun. Run `just` to list recipes.

version := `jq .version < package.json | tr -d '"'`
repo    := "https://github.com/inquirex/inquirex-widget"

# The published package page, opened after a successful `just publish`. Read
# from package.json rather than hardcoded, so the rename that took this package
# from @kigster/inquirex-js to inquirex-widget cannot leave a stale link here.
pkg_url := "https://www.npmjs.com/package/" + `jq -r .name < package.json`

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

# Everything the CI `checks` job runs, in the same order (read-only)
ci: typecheck lint coverage

# The name every package in the family answers to, and the one
# `inquirex versions-bump` invokes after rewriting a version. Deliberately not
# an alias for `check`, which writes: a bump must be able to verify a package
# without reformatting it. Without this the bump reported FAIL with "justfile
# does not contain recipe `check-all`" — indistinguishable, in that report,
# from a real test failure.
alias check-all := ci

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

# Publish to npm, logging in first if needed. 2FA code comes from 1Password.
publish:
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

    # Read the current npm 2FA code from 1Password. The `|| true` is load-bearing:
    # under `set -e` a failed `op read` (not signed in, item renamed, op missing)
    # would abort the recipe before the fallback below could ever run.
    otp=$(/opt/homebrew/bin/op read \
      "op://open-source-repos/npmjs/one-time password?attribute=otp" 2>/dev/null || true)

    # `prepublishOnly` rebuilds and runs the full test suite before packing.
    if [ -n "${otp}" ]; then
      bun publish --otp "${otp}"
    else
      echo "npm: no OTP from 1Password — bun will prompt if 2FA is required."
      bun publish
    fi

    # Only reachable when the publish succeeded: `set -e` aborts the recipe on
    # a non-zero exit, so the page never opens for a release that failed.
    echo "published {{ pkg_url }}"
    open "{{ pkg_url }}" 2>/dev/null || xdg-open "{{ pkg_url }}" 2>/dev/null || true

# Tag v{{ version }}, publish the GH release, & refresh the Homebrew tap.
release:
    git fetch --tags
    git tag -f "v{{ version }}"
    git push -f --tags
    gh release delete -y "v{{ version }}" --repo {{ repo }} 2>/dev/null || true
    gh release create "v{{ version }}" --generate-notes --repo {{ repo }}
