# JSLab workspace

JSLab is organized as a multi-project wearable workspace. Each deliverable keeps its own build system and dependency boundary.

```text
apps/
  vela-quickapp/                 JSLab Vela JS quick app for Band Pro
plugins/
  astrobox-sync/                 AstroBox WASI plugin (.abp)
  ccicc-jslab-cloud/             Reserved home for the future ccicc.icu plugin
tooling/
  ccicc-plugin-development-kit/  ccicc.icu plugin template and packer
watchfaces/
  lua-dev-template/              Independent Lua watchface Git workspace
docs/
  architecture.md                Ownership, build and delivery map
```

## Common commands

```powershell
# Vela quick app
cd apps/vela-quickapp
npm run lint
npm run release

# AstroBox plugin
cd ../../plugins/astrobox-sync
./build.ps1
```

The Lua watchface workspace has its own Git repository and Python virtual environment. Its local build command creates a `.face` only; deployment and hot reload are deliberately separate, device-affecting actions.

See [workspace architecture](docs/architecture.md) for boundaries and release outputs.

Open [JSLab.code-workspace](JSLab.code-workspace) in VS Code to work with all projects as separate roots.
