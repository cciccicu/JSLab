# JSLab workspace

JSLab is organized as a multi-project wearable workspace. Each deliverable keeps its own build system and dependency boundary.

```text
vela-quickapp/                   JSLab Vela JS quick app for Band Pro
astrobox-plugin-sync/            AstroBox WASI plugin (.abp)
ccicc-plugin-cloud/              Future ccicc.icu plugin plus development Kit
vela-luawatchface/               Independent Lua watchface Git workspace
docs/
  architecture.md                Ownership, build and delivery map
```

## Common commands

```powershell
# Vela quick app
cd vela-quickapp
npm run lint
npm run release

# AstroBox plugin
cd astrobox-plugin-sync
./build.ps1
```

The Lua watchface workspace has its own Git repository and Python virtual environment. Its local build command creates a `.face` only; deployment and hot reload are deliberately separate, device-affecting actions.

See [workspace architecture](docs/architecture.md) for boundaries and release outputs.

Open [JSLab.code-workspace](JSLab.code-workspace) in VS Code to work with all projects as separate roots.
