# JSLab workspace instructions

This repository contains several independent deliverables. Work inside the matching project directory and do not mix build outputs or runtime contracts across projects.

- `apps/vela-quickapp/AGENTS.md` governs the Vela JS quick app.
- `plugins/astrobox-sync/` is an AstroBox WASI plugin; use its WIT contract and `manifest.json`.
- `plugins/ccicc-jslab-cloud/` is reserved for the future ccicc.icu plugin. Use `tooling/ccicc-plugin-development-kit/` to scaffold it when cloud work begins.
- `watchfaces/lua-dev-template/` is a separate Git workspace. Its device deployment scripts require explicit user authorization.

Run commands from the target project directory. Do not connect to a simulator or physical device unless the user explicitly authorizes that action.
