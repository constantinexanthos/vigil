# Homebrew formula for vigil-proxy

Source of truth for the `constantinexanthos/homebrew-vigil` tap. On every
tagged release, the formula in this directory gets copied (or its
checksum block updated) into the tap repo so `brew install
constantinexanthos/vigil/vigil` resolves to the current binary.

## One-time setup — create the tap repo

A Homebrew tap is just a GitHub repo named `homebrew-<name>` containing
`.rb` formulae in `Formula/` (or in the repo root). The convention:

1. Create a public repo `constantinexanthos/homebrew-vigil` on GitHub.
2. `git init`, add a single file `Formula/vigil.rb` copied from
   `proxy/dist/homebrew/vigil.rb` in this repo, commit, push.
3. (Optional) Add a one-line `README.md` to the tap repo pointing back
   to `https://github.com/constantinexanthos/vigil` for issue tracking.

After that:

```bash
brew tap constantinexanthos/vigil
brew install vigil
```

works for every Homebrew user on macOS and Linux.

## Recurring workflow — bump on a new release

When `git tag v0.1.0e` lands and `.github/workflows/release.yml` runs to
completion, four binaries are attached to the GitHub Release. The
workflow log prints the SHA256 of each as the last step. Copy them.

In this repo's `proxy/dist/homebrew/vigil.rb`:

1. Bump `version "0.1.0d"` to the new tag (without the leading `v`).
2. Replace each of the four `REPLACE_WITH_*_SHA256` strings with the
   actual SHA256 from the workflow log.
3. Commit on `main`. The change is part of the next merged PR — it does
   not need to land in the tap repo before the GitHub Release exists.

Then in the tap repo (`constantinexanthos/homebrew-vigil`):

```bash
cd ~/path/to/homebrew-vigil
cp /path/to/vigil/proxy/dist/homebrew/vigil.rb Formula/vigil.rb
git add Formula/vigil.rb
git commit -m "vigil $VERSION"
git push origin main
```

End users on the new version pick up the bump on their next
`brew update`.

## Local validation before publishing

Before pushing to the tap, validate the formula in this repo against a
local build:

```bash
# 1. Build a local release binary so the SHA256 in the formula is
#    deterministic.
make release-all

# 2. Compute the SHA256s and patch them into a copy of the formula:
#    (For local testing only — do not commit the patched-with-local-
#    SHA file to the tap.)
cd proxy/dist/homebrew
sed -e "s|REPLACE_WITH_DARWIN_ARM64_SHA256|$(shasum -a 256 ../../../dist/vigil-proxy-*-darwin-arm64 | awk '{print $1}')|" \
    vigil.rb > /tmp/vigil-local.rb

# 3. Install from that local file.
brew install --build-from-source /tmp/vigil-local.rb

# 4. Run brew's own test harness against the installed formula.
brew test vigil

# 5. Verify the installed binary works.
which vigil-proxy
vigil-proxy --version
```

For a real release the `url` in the formula must point at the actual
GitHub Releases asset; the local test above only verifies that the
formula shape is correct.

## Notes

- The formula ships pre-built binaries by URL rather than building from
  source via `go install`. End users save a multi-minute compile and do
  not need a Go toolchain installed. The release workflow does the
  build once in CI.
- macOS notarization is deferred. Until Vigil is signed and notarized,
  end users hitting Gatekeeper on first run will see "cannot verify
  developer" and can clear it with `xattr -d com.apple.quarantine
  $(which vigil-proxy)`. Homebrew handles this transparently for most
  users because binaries installed via brew aren't quarantined.
- The tap is publish-on-tag, not auto-tagged. Costa pushes manually so
  the publish step doubles as a release gate.
