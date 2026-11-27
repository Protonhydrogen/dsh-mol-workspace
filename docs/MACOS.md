# macOS compatibility and validation

## Support status

| Layer | Windows | macOS |
| --- | --- | --- |
| Runtime code | Verified in DSH Desktop 0.2.2-rc.5 with live Mol* rendering | No OS-specific branch found; browser/Mol* renderer is shared with Windows |
| Host persistence | Verified from the user profile storage | Uses Node os.homedir() and path.join(); expected portable |
| Build/test resolution | Supports repository, MOLSTAR_ROOT and DSH_ROOT | Same env-variable contract, POSIX paths supported |
| Profile installer | Unit tested on Windows with an explicit macOS path expectation | Pending acceptance on a real Mac |
| Native acceptance | Passed, including closed-sidebar Agent wake-up, real DCD playback and export | **Not yet claimed** until a real macOS DSH run completes |

The plugin is not shipped as a Mac-specific fork. It uses standard Node.js ESM, path.join/homedir for host-side storage, and the same browser-side Mol* renderer on supported operating systems. No DSH core file is modified.

## Installing on macOS

Clone or copy the repository to a stable local directory, for example:

```sh
mkdir -p "$HOME/Research"
cd "$HOME/Research"
git clone https://github.com/Protonhydrogen/dsh-mol-workspace.git
cd dsh-mol-workspace
```

Preview the profile change without writing anything:

```sh
node scripts/install-profile.mjs --profile-dir "$HOME/.dsh/profiles/desktop"
```

If the preview shows the expected dependency and bundle entry, apply it:

```sh
node scripts/install-profile.mjs --profile-dir "$HOME/.dsh/profiles/desktop" --write
cd "$HOME/.dsh/profiles/desktop"
pnpm install
```

The installer is idempotent, preserves existing dependencies and dsh.profile settings, creates a one-time backup before rewriting an existing profile package.json, and stops before replacing malformed JSON. It does not install dependencies, restart DSH, or modify DSH core.

Finally perform a **full DSH restart**, open the right sidebar and choose **Mol* Viewer**.

## Real-Mac acceptance checklist

A Mac validation must not be inferred from tests elsewhere. Run the following on the target Mac and retain outputs:

1. DSH Desktop starts the configured profile and lists dsh-mol-workspace as installed/effective.
2. Opening Mol* Viewer renders a local PDB/mmCIF fixture and a four-character RCSB ID.
3. Mouse selection retains model, auth/label chain, residue and atom identity; empty canvas returns to Overview.
4. Agent tools load, focus, style and measure from a closed sidebar; the viewer opens automatically.
5. A distance measurement agrees with an independent coordinate calculation.
6. DCD/XTC topology attachment plays, pauses and holds the selected frame; the Agent-visible measurement changes with frames.
7. PNG/JPEG export writes evidence JSON without exposing an absolute local path in the portable report.
8. WebM video export works when available; MP4 is shown only after a successful encoder probe.
9. The sidebar follows DSH light/dark theme and composer references insert without auto-sending.

Record the exact macOS, DSH, browser engine and GPU/WebGL availability in the acceptance file. A failure remains visible; it is not converted into an approximate success.

## Known limits

- The profile installer makes package-manager links portable, but it does not itself validate Mol* rendering or DSH startup on macOS.
- On systems whose browser does not provide required WebGL2/WebGL extensions, Molstar fallback and renderer capability must be observed in the actual DSH browser rather than guessed.
- MP4 encoding remains environment-dependent; WebM remains the portable video fallback.
