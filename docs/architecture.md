# Workspace architecture

| Project | Purpose | Build output | Device interaction |
| --- | --- | --- | --- |
| `vela-quickapp` | JSLab Vela JS app | `.rpk` | AIoT tooling only when explicitly requested |
| `astrobox-plugin-sync` | AstroBox companion/sync plugin | `.abp` | Host-mediated; no direct Vela app source access |
| `ccicc-plugin-cloud` | ccicc.icu JSLab Cloud plugin | `jslab-cloud/dist/*.zip` | Server-side plugin, separate from wearable deployment |
| `vela-luawatchface` | Lua watchface project | `.face` | Its deployment/hot-reload scripts use ADB and require explicit approval |

## Ownership rules

- The quick app is the only project that owns Vela `.ux`, `manifest.json`, `src/`, and AIoT build configuration.
- AstroBox owns companion-side transfer and configuration UI. It communicates through the documented transport contract, not by reading quick-app source files.
- The ccicc.icu plugin owns cloud persistence, accounts, AI generation, pairing, and market routes. It is scaffolded from the development Kit and must not share host-runtime code with AstroBox.
- Lua watchfaces are independent artifacts with a separate Git history and dependency environment. They are not bundled into the RPK or ABP.

## Adding the cloud plugin

Copy `ccicc-plugin-cloud/development-kit/example-plugin` to the cloud plugin implementation directory, then set the directory name and `manifest.json.id` to the same lowercase, hyphenated identifier. Keep generated ZIP files in that plugin's ignored `dist/` directory.
