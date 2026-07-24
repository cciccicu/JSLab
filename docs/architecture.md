# Workspace architecture

| Project | Purpose | Build output | Device interaction |
| --- | --- | --- | --- |
| `apps/vela-quickapp` | JSLab Vela JS app | `.rpk` | AIoT tooling only when explicitly requested |
| `plugins/astrobox-sync` | AstroBox companion/sync plugin | `.abp` | Host-mediated; no direct Vela app source access |
| `plugins/ccicc-jslab-cloud` | Planned ccicc.icu cloud plugin | Future `.zip` | Server-side plugin, separate from wearable deployment |
| `watchfaces/lua-dev-template` | Lua watchface project | `.face` | Its deployment/hot-reload scripts use ADB and require explicit approval |

## Ownership rules

- The quick app is the only project that owns Vela `.ux`, `manifest.json`, `src/`, and AIoT build configuration.
- AstroBox owns companion-side transfer and configuration UI. It communicates through the documented transport contract, not by reading quick-app source files.
- The ccicc.icu plugin will own cloud persistence, accounts, and web routes. It must be scaffolded from the development Kit and must not share host-runtime code with AstroBox.
- Lua watchfaces are independent artifacts with a separate Git history and dependency environment. They are not bundled into the RPK or ABP.

## Adding the cloud plugin

Copy `tooling/ccicc-plugin-development-kit/example-plugin` to `plugins/ccicc-jslab-cloud`, then set the directory name and `manifest.json.id` to the same lowercase, hyphenated identifier. Keep generated ZIP files in that plugin's ignored `dist/` directory.
