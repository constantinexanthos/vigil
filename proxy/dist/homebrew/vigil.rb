# frozen_string_literal: true

# Homebrew formula for vigil-proxy.
#
# Source of truth lives in this repo at proxy/dist/homebrew/vigil.rb.
# This file is copied (or symlinked) into the
# constantinexanthos/homebrew-vigil tap repository on each release —
# see proxy/dist/homebrew/README.md for the publish workflow.
#
# Per release, the operator edits exactly four lines: the version
# constant, then the four sha256 lines under on_macos / on_linux.
# The download URLs derive from the version via release_url below.
#
# The formula installs a pre-built binary (no `go install` from
# source) because Go binaries cross-compile in a few seconds in CI
# and end users should not need a Go toolchain to `brew install
# vigil`. Operators who want to build from source can still run
# `brew install --build-from-source` against the head_install block
# below or invoke `go install github.com/constantinexanthos/vigil/...`
# directly.

class Vigil < Formula
  desc     "Agent-aware data plane proxy for Postgres (and friends)"
  homepage "https://bevigil.ai"
  version  "0.1.0d"
  license  "MIT"

  # Pre-built binaries live on the GitHub Release for this version.
  # The release.yml workflow uploads four: {darwin,linux} x {arm64,amd64}.
  def self.release_url(os, arch)
    "https://github.com/constantinexanthos/vigil/releases/download/v#{version}/vigil-proxy-v#{version}-#{os}-#{arch}"
  end

  # SHA256 placeholders. Replace with the real hashes printed by the
  # release.yml workflow log when bumping `version` above. Until a
  # v0.1.0d release exists, these zero-hashes will cause `brew install`
  # to refuse the download — that's intentional, the user should hit
  # `brew tap` first and see a real release.
  on_macos do
    on_arm do
      url Vigil.release_url("darwin", "arm64")
      sha256 "b165186d1b9b26aecdd38277de101108aa680c8649b9854e7df207eb960b8141"
    end
    on_intel do
      url Vigil.release_url("darwin", "amd64")
      sha256 "113a154263a47281d4787d673c7738b73bda0c4ed05a4993028c11d6ef4ee50a"
    end
  end

  on_linux do
    on_arm do
      url Vigil.release_url("linux", "arm64")
      sha256 "f89ef15e98caa22e989cdc1ff09a1463ad0e265f1e3c724be99551c9881ab95d"
    end
    on_intel do
      url Vigil.release_url("linux", "amd64")
      sha256 "0a3aec6931d2a4886b9c485a925ecaf91783f6b7980953433e7e0a9b641e92da"
    end
  end

  # The downloaded artifact is the bare binary, not a tarball.
  # Brew's downloader fetches it; `install` just renames it into
  # the Cellar bin/.
  def install
    # The downloaded file has the platform-suffixed name. Rename to
    # the canonical `vigil-proxy` Homebrew users expect on PATH.
    bin.install Dir["vigil-proxy-*"].first => "vigil-proxy"
  end

  def caveats
    <<~EOS
      vigil-proxy is the data plane. To run it:

        vigil-proxy --postgres-listen :7432 --postgres-upstream localhost:5432

      Identity store + audit DB land in ~/.vigil/ (created on first run).

      MCP integration for Claude Code / Cursor / Codex:

        Add to ~/.claude/mcp.json:
          {
            "mcpServers": {
              "vigil": {
                "command": "#{HOMEBREW_PREFIX}/bin/vigil-proxy",
                "args": ["--mcp-stdio"]
              }
            }
          }

      Docs: https://bevigil.ai
    EOS
  end

  test do
    # --version exits 0 and prints a non-empty string. We don't
    # assert the exact version because `brew test` runs against
    # whatever was installed; if the formula's version constant and
    # the binary disagree, that's a packaging bug that surfaces here
    # rather than at the user's first `vigil-proxy` invocation.
    output = shell_output("#{bin}/vigil-proxy --version")
    assert_match(/vigil-proxy/, output)
  end
end
