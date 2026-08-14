# JSLab Helper Lua Watchface

This repository contains the Lua watchface used by JSLab. It is a watchface
project, not a Vela Quick App and does not contain an AIoT/Quick App simulator
scaffold.

## Project Layout

- `watchface.config.json`: project name, numeric watchface ID and LVGL resource settings.
- `watchface/fprj/`: editable watchface project.
- `watchface/fprj/app/`: files released to the watch, including `lua/main.lua` and resources.
- `watchface/tools/`: face compiler and LVGL v8/v9 image converters.
- `scripts/build_face.ps1`: compile a `.face` package and generate `watchface/data/resource.bin`.
- `scripts/gen_watchface_id.ps1`: generate a valid random watchface ID.
- `scripts/pushlua.ps1`: optional ADB deployment and hot reload; run only with explicit device authorization.
- `scripts/reloader.lua`: development-only hot reload wrapper injected by `pushlua.ps1`.

Generated files under `bin/`, `build/`, `dist/`, `watchface/data/` and
`watchface/fprj/output/` are ignored and are not source files.

## Build

Install the Python dependencies once:

```powershell
python -m pip install -r requirements.txt
```

Build the current `JSLab Helper` face:

```powershell
.\scripts\build_face.ps1
```

The output is written to `bin\JSLab Helper.face` and the generated resource
binary is written to `watchface\data\resource.bin`.

The resource converter follows `watchface.config.json`. LVGL v8 devices must
use `lvglVersion: 8`, `compress: NONE` and `align: 1`; LVGL v9 supports the
additional compression and alignment options documented by the converter.

## Optional Device Workflow

`pushlua.ps1` uses ADB to deploy the face and Lua files to a device or
emulator. It is intentionally separate from the build and is never run by a
build command:

```powershell
.\scripts\pushlua.ps1
.\scripts\pushlua.ps1 -Hot
```

The script injects `scripts/reloader.lua`, so hot reload is a development
workflow. A normal face package remains independent of the reloader.

## JSLab Helper

The face is named `JSLab Helper`. Its Lua entry point is
`watchface/fprj/app/lua/main.lua`; the bundled animation frames are under
`watchface/fprj/app/images/helper-animation-bin/`.
