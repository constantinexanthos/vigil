# frozen_string_literal: true

# Homebrew formula for vigil-proxy + vigil-run.
#
# Source of truth lives in this repo at proxy/dist/homebrew/vigil.rb.
# This file is copied (or symlinked) into the
# constantinexanthos/homebrew-vigil tap repository on each release —
# see proxy/dist/homebrew/README.md for the publish workflow.
#
# Per release, the operator edits the version constant + the eight
# sha256 lines (two binaries × four platforms). The download URLs
# derive from the version via release_url below.
#
# The formula installs pre-built binaries (no `go install` from
# source) because Go binaries cross-compile in a few seconds in CI
# and end users should not need a Go toolchain to `brew install
# vigil`. We use a `resource` block for vigil-run so a single
# `brew install vigil` lands both binaries on PATH.

class Vigil < Formula
  desc     "Agent-aware data plane proxy for Postgres (and friends)"
  homepage "https://bevigil.ai"
  version  "0.1.0d"
  license  "MIT"

  # Pre-built binaries live on the GitHub Release for this version.
  # The release.yml workflow uploads eight: vigil-proxy + vigil-run
  # for each of {darwin,linux} x {arm64,amd64}.
  def self.release_url(name, os, arch)
    "https://github.com/constantinexanthos/vigil/releases/download/v#{version}/#{name}-v#{version}-#{os}-#{arch}"
  end

  # vigil-proxy artifact (downloaded by the formula's `url` block).
  on_macos do
    on_arm do
      url Vigil.release_url("vigil-proxy", "darwin", "arm64")
      sha256 "b165186d1b9b26aecdd38277de101108aa680c8649b9854e7df207eb960b8141"
    end
    on_intel do
      url Vigil.release_url("vigil-proxy", "darwin", "amd64")
      sha256 "113a154263a47281d4787d673c7738b73bda0c4ed05a4993028c11d6ef4ee50a"
    end
  end

  on_linux do
    on_arm do
      url Vigil.release_url("vigil-proxy", "linux", "arm64")
      sha256 "f89ef15e98caa22e989cdc1ff09a1463ad0e265f1e3c724be99551c9881ab95d"
    end
    on_intel do
      url Vigil.release_url("vigil-proxy", "linux", "amd64")
      sha256 "0a3aec6931d2a4886b9c485a925ecaf91783f6b7980953433e7e0a9b641e92da"
    end
  end

  # vigil-run ships alongside as a `resource`. Each release's
  # release-all Makefile target emits a {darwin,linux} × {arm64,amd64}
  # matrix for it; the resource block picks the right one at install
  # time. Sha256 placeholders are zero — the operator replaces them
  # when bumping the formula version.
  resource "vigil-run" do
    on_macos do
      on_arm do
        url Vigil.release_url("vigil-run", "darwin", "arm64")
        sha256 "0000000000000000000000000000000000000000000000000000000000000000"
      end
      on_intel do
        url Vigil.release_url("vigil-run", "darwin", "amd64")
        sha256 "0000000000000000000000000000000000000000000000000000000000000000"
      end
    end
    on_linux do
      on_arm do
        url Vigil.release_url("vigil-run", "linux", "arm64")
        sha256 "0000000000000000000000000000000000000000000000000000000000000000"
      end
      on_intel do
        url Vigil.release_url("vigil-run", "linux", "amd64")
        sha256 "0000000000000000000000000000000000000000000000000000000000000000"
      end
    end
  end

  # The downloaded artifact is the bare binary, not a tarball.
  # Brew's downloader fetches it; `install` renames both binaries
  # into the Cellar bin/.
  def install
    bin.install Dir["vigil-proxy-*"].first => "vigil-proxy"
    resource("vigil-run").stage do
      bin.install Dir["vigil-run-*"].first => "vigil-run"
    end
  end

  def caveats
    <<~EOS
      vigil-proxy is the data plane. To run it:

        vigil-proxy --postgres-listen :7432 --postgres-upstream localhost:5432

      Identity store + audit DB land in ~/.vigil/ (created on first run).

      vigil-run wraps an arbitrary subprocess with a Vigil identity:

        vigil-run claude
        vigil-run python my_script.py
        vigil-run --principal=you@example.com codex

      See: https://bevigil.ai/docs/harnesses/

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
    # --version exits 0 and prints a non-empty string for both
    # binaries. We don't assert exact versions because `brew test`
    # runs against whatever was installed; a formula/version
    # mismatch surfaces here rather than at user-first-invoke time.
    proxy_output = shell_output("#{bin}/vigil-proxy --version")
    assert_match(/vigil-proxy/, proxy_output)

    run_output = shell_output("#{bin}/vigil-run --version")
    assert_match(/vigil-run/, run_output)
  end
end
