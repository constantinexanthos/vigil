# Vigil — top-level Makefile.
#
# Targets are deliberately minimal. Each subsystem (daemon, app, proxy)
# already has its own build / test commands; the Makefile is the
# zero-friction entry point for cross-cutting tasks.

.PHONY: bench bench-help release release-all release-clean build-vigil-run

# Version source of truth: the latest git tag. Fall back to v0.0.0-dev
# for working trees without a tag so local builds always succeed.
VERSION ?= $(shell git describe --tags --abbrev=0 2>/dev/null || echo v0.0.0-dev)

# Default release host (used by `make release`) — detect from `go env`
# so the developer's machine produces a native binary by default.
HOST_OS   ?= $(shell go env GOOS)
HOST_ARCH ?= $(shell go env GOARCH)

# Stripped + reproducible build flags. `-s -w` drops the symbol table
# and DWARF; `-X` injects the version string into the config package
# so `vigil-proxy --version` matches the tag. `-trimpath` removes
# absolute paths from stack traces so two machines building the same
# tag produce byte-identical binaries.
GO_LDFLAGS = -s -w -X github.com/costaxanthos/vigil/proxy/internal/config.Version=$(VERSION)
GO_BUILDFLAGS = -trimpath -ldflags='$(GO_LDFLAGS)'

# Size ceiling for release binaries. Single-binary OSS proxies of this
# class come in around 10MB once pure-Go SQLite (modernc.org/sqlite)
# and Go 1.26's stdlib crypto are linked in. We assert ≤12MB so a
# regression (someone accidentally drags in a fat dependency or
# re-enables CGO) shows up at `make release` rather than at the user's
# machine. Tailscale, for reference, ships ~30MB; vigil-proxy's small
# surface area earns us a much tighter target.
MAX_SIZE_BYTES ?= 12582912

# Run the coalescing benchmark end-to-end. Spins ephemeral Postgres in
# Docker (or honors BENCH_PG_URL), runs the workload twice (direct then
# through-proxy), writes proxy/bench/RESULTS.md and results.json.
#
# Examples:
#   make bench
#   BENCH_PRESET=refactor make bench
#   BENCH_DURATION=30s BENCH_CONCURRENCY=8 make bench
#   BENCH_PG_URL=postgres://postgres:test@localhost:5432/postgres make bench
bench:
	@bash proxy/bench/scripts/run.sh

bench-help:
	@bash proxy/bench/scripts/run.sh --help

# Build a stripped release binary for the host platform. Output:
#   dist/vigil-proxy-$(VERSION)-$(HOST_OS)-$(HOST_ARCH)
#   dist/vigil-run-$(VERSION)-$(HOST_OS)-$(HOST_ARCH)
#
# CGO_ENABLED=0 is set explicitly because proxy/ uses modernc.org/sqlite
# (pure Go) — any future dependency that quietly drags CGO back in would
# break cross-compile, and we want that failure loud here at `make release`
# rather than in the GitHub Actions release workflow.
release:
	@mkdir -p dist
	@$(MAKE) --no-print-directory build-one    OS=$(HOST_OS) ARCH=$(HOST_ARCH)
	@$(MAKE) --no-print-directory build-vigil-run-one OS=$(HOST_OS) ARCH=$(HOST_ARCH)

# Build all release binaries (proxy + vigil-run) across four targets.
# Each binary is asserted ≤MAX_SIZE_BYTES and its SHA256 printed for
# copy-paste into the Homebrew formula bump.
release-all:
	@mkdir -p dist
	@$(MAKE) --no-print-directory build-one OS=darwin ARCH=arm64
	@$(MAKE) --no-print-directory build-one OS=darwin ARCH=amd64
	@$(MAKE) --no-print-directory build-one OS=linux  ARCH=arm64
	@$(MAKE) --no-print-directory build-one OS=linux  ARCH=amd64
	@$(MAKE) --no-print-directory build-vigil-run-one OS=darwin ARCH=arm64
	@$(MAKE) --no-print-directory build-vigil-run-one OS=darwin ARCH=amd64
	@$(MAKE) --no-print-directory build-vigil-run-one OS=linux  ARCH=arm64
	@$(MAKE) --no-print-directory build-vigil-run-one OS=linux  ARCH=amd64
	@echo ""
	@echo "==> Release binaries:"
	@ls -lh dist/vigil-proxy-$(VERSION)-* dist/vigil-run-$(VERSION)-*

# Internal target: build one vigil-proxy (OS,ARCH) combination and
# assert size. Called by `release` and `release-all`; not meant for
# direct use.
.PHONY: build-one
build-one:
	@if [ -z "$(OS)" ] || [ -z "$(ARCH)" ]; then \
		echo "build-one: OS and ARCH must be set"; exit 1; \
	fi
	@repo_root=$$(pwd); \
	out=$$repo_root/dist/vigil-proxy-$(VERSION)-$(OS)-$(ARCH); \
	mkdir -p "$$(dirname $$out)"; \
	echo "==> Building dist/vigil-proxy-$(VERSION)-$(OS)-$(ARCH) (version=$(VERSION))"; \
	cd $$repo_root/proxy && CGO_ENABLED=0 GOOS=$(OS) GOARCH=$(ARCH) \
		go build $(GO_BUILDFLAGS) -o "$$out" ./cmd/vigil-proxy; \
	size=$$(wc -c < "$$out" | tr -d ' '); \
	if [ "$$size" -gt $(MAX_SIZE_BYTES) ]; then \
		echo "FAIL: dist/vigil-proxy-$(VERSION)-$(OS)-$(ARCH) is $$size bytes (> $(MAX_SIZE_BYTES) byte ceiling)"; \
		exit 1; \
	fi; \
	sha=$$(shasum -a 256 "$$out" | awk '{print $$1}'); \
	echo "    size: $$size bytes"; \
	echo "    sha256: $$sha"

# Build vigil-run for the host platform. Useful for local dev — the
# release flow calls this via build-vigil-run-one (which adds the
# size assertion + per-target wiring used by release-all).
build-vigil-run:
	@mkdir -p dist
	@$(MAKE) --no-print-directory build-vigil-run-one OS=$(HOST_OS) ARCH=$(HOST_ARCH)

# Internal: build one vigil-run (OS,ARCH) combination. vigil-run has
# no SQLite dependency so it's tiny — the size ceiling is a sanity
# guard rather than a real risk surface.
.PHONY: build-vigil-run-one
build-vigil-run-one:
	@if [ -z "$(OS)" ] || [ -z "$(ARCH)" ]; then \
		echo "build-vigil-run-one: OS and ARCH must be set"; exit 1; \
	fi
	@repo_root=$$(pwd); \
	out=$$repo_root/dist/vigil-run-$(VERSION)-$(OS)-$(ARCH); \
	mkdir -p "$$(dirname $$out)"; \
	echo "==> Building dist/vigil-run-$(VERSION)-$(OS)-$(ARCH) (version=$(VERSION))"; \
	cd $$repo_root/proxy && CGO_ENABLED=0 GOOS=$(OS) GOARCH=$(ARCH) \
		go build -trimpath -ldflags='-s -w -X main.Version=$(VERSION)' \
		-o "$$out" ./cmd/vigil-run; \
	size=$$(wc -c < "$$out" | tr -d ' '); \
	if [ "$$size" -gt $(MAX_SIZE_BYTES) ]; then \
		echo "FAIL: dist/vigil-run-$(VERSION)-$(OS)-$(ARCH) is $$size bytes (> $(MAX_SIZE_BYTES) byte ceiling)"; \
		exit 1; \
	fi; \
	sha=$$(shasum -a 256 "$$out" | awk '{print $$1}'); \
	echo "    size: $$size bytes"; \
	echo "    sha256: $$sha"

# Wipe build artifacts. Cheap; useful before a clean re-release.
release-clean:
	@rm -rf dist
	@echo "==> dist/ removed"
