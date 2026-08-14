# Shared Module Boundaries

`src/utils` contains reusable application code, grouped by ownership rather than by file type.

- `core/`: application-wide infrastructure such as routing, configuration, dialogs, time, feedback, and Vela compatibility helpers.
- `cloud/`: JSLab Cloud transport and API orchestration. Cloud modules may depend on `core/`, `files/`, and `editor/` services.
- `editor/`: editor behavior, syntax highlighting, font handling, and editor-version selection.
- `files/`: local script-file access, metadata, sorting, and transfer integrity.
- `runtime/`: Console/UI script mode detection and the APIs injected into user scripts.

Page files should import the narrow module that owns the behavior. Native `@system.*` imports remain valid in a page when the capability is page-specific, such as terminating the app or reading app information. Examples and templates belong under `src/data/`, not in `utils`.
