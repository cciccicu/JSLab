# JSLab workspace

JSLab is organized as a multi-project wearable workspace. Each deliverable keeps its own build system and dependency boundary.

```text
vela-quickapp/                   JSLab Vela JS quick app for Band Pro
astrobox-plugin-sync/            AstroBox WASI plugin (.abp)
ccicc-plugin-cloud/              ccicc.icu JSLab Cloud plugin plus development Kit
vela-luawatchface/               JSLab Helper Lua watchface project
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

# ccicc.icu cloud plugin
cd ..\ccicc-plugin-cloud\jslab-cloud
npm test
npm run pack -- .\ .\dist\jslab-cloud-0.5.0.zip
```

The Lua watchface project builds a `.face` through its own PowerShell/Python toolchain. Deployment and hot reload are deliberately separate, device-affecting actions.

See [workspace architecture](docs/architecture.md) for boundaries and release outputs.

Open [JSLab.code-workspace](JSLab.code-workspace) in VS Code to work with all projects as separate roots.
