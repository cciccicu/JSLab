#!/usr/bin/env python3
import argparse
import json
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path


def run_cargo_build(root_dir, cargo_args):
    cmd = ["cargo", "build", *cargo_args]
    result = subprocess.run(cmd, cwd=root_dir)
    if result.returncode != 0:
        sys.exit(result.returncode)


def load_cargo_metadata(root_dir):
    cmd = ["cargo", "metadata", "--no-deps", "--format-version", "1"]
    result = subprocess.run(
        cmd,
        cwd=root_dir,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        sys.stderr.write(result.stderr or result.stdout)
        sys.exit(result.returncode)
    return json.loads(result.stdout)


def pick_root_package(metadata, root_manifest):
    packages = metadata.get("packages", [])
    for pkg in packages:
        manifest_path = Path(pkg.get("manifest_path", "")).resolve()
        if manifest_path == root_manifest:
            return pkg

    members = metadata.get("workspace_members", [])
    if members:
        member_id = members[0]
        for pkg in packages:
            if pkg.get("id") == member_id:
                return pkg

    return packages[0] if packages else None


def find_wasm(target_dir, profile, target, entry_name, crate_name):
    patterns = []
    if entry_name:
        patterns.append(entry_name)
    if crate_name:
        patterns.append(f"{crate_name}.wasm")
        patterns.append(f"lib{crate_name}.wasm")

    search_root = target_dir / target if target else target_dir
    if not search_root.exists():
        search_root = target_dir

    for pattern in patterns:
        matches = []
        for path in search_root.rglob(pattern):
            if not path.is_file():
                continue
            if profile and profile not in path.parts:
                continue
            matches.append(path)
        if matches:
            matches.sort(key=lambda p: p.stat().st_mtime, reverse=True)
            return matches[0]

    return None


def copy_item(root_dir, dist_dir, rel_path):
    if not rel_path:
        return

    src = Path(rel_path)
    if not src.is_absolute():
        src = root_dir / rel_path

    if not src.exists():
        sys.stderr.write(f"warning: path not found: {rel_path}\n")
        return

    dest_rel = rel_path.lstrip("/\\")
    dest = dist_dir / dest_rel

    if src.is_dir():
        dest.mkdir(parents=True, exist_ok=True)
        shutil.copytree(src, dest, dirs_exist_ok=True)
    else:
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)


def make_package_name(raw_name, fallback):
    name = (raw_name or "").strip()
    if not name:
        name = (fallback or "plugin").strip()
    if not name:
        name = "plugin"

    invalid = '<>:"/\\|?*'
    cleaned = []
    for ch in name:
        cleaned.append("_" if ch in invalid else ch)

    safe = "".join(cleaned).strip(" .")
    return safe or "plugin"


def package_dist(dist_dir, output_path):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    files = [
        path
        for path in dist_dir.rglob("*")
        if path.is_file() and path.resolve() != output_path.resolve()
    ]

    with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in files:
            archive.write(path, path.relative_to(dist_dir))


def main():
    parser = argparse.ArgumentParser(
        description="Build wasm with cargo and package dist assets."
    )
    parser.add_argument("--release", action="store_true", help="Use release profile")
    parser.add_argument("--profile", help="Use a specific cargo profile")
    parser.add_argument("--target", help="Override cargo target triple")
    parser.add_argument(
        "--package",
        action="store_true",
        help="Package dist into <name>.abp",
    )
    args, extra = parser.parse_known_args()

    cargo_args = []
    profile = "debug"

    if args.profile:
        cargo_args.extend(["--profile", args.profile])
        profile = args.profile
    elif args.release:
        cargo_args.append("--release")
        profile = "release"

    if args.target:
        cargo_args.extend(["--target", args.target])

    cargo_args.extend(extra)

    root_dir = Path(__file__).resolve().parent.parent
    manifest_path = root_dir / "manifest.json"

    if not manifest_path.exists():
        sys.stderr.write(f"manifest.json not found: {manifest_path}\n")
        sys.exit(1)

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    plugin_name = manifest.get("name")
    entry = str(manifest.get("entry") or "")
    icon = str(manifest.get("icon") or "")
    additional = manifest.get("additional_files") or []

    run_cargo_build(root_dir, cargo_args)

    metadata = load_cargo_metadata(root_dir)
    target_dir = Path(metadata.get("target_directory", root_dir / "target"))

    root_manifest = (root_dir / "Cargo.toml").resolve()
    root_package = pick_root_package(metadata, root_manifest)
    crate_name = None
    if root_package:
        crate_name = root_package.get("name")
        if crate_name:
            crate_name = crate_name.replace("-", "_")

    entry_name = Path(entry).name if entry else ""
    wasm_path = find_wasm(target_dir, profile, args.target, entry_name, crate_name)
    if not wasm_path:
        sys.stderr.write(
            "wasm artifact not found. Looked for "
            f"{entry_name or crate_name or '*.wasm'} in {target_dir}\n"
        )
        sys.exit(1)

    dist_dir = root_dir / "dist"
    dist_dir.mkdir(parents=True, exist_ok=True)

    copy_item(root_dir, dist_dir, "manifest.json")

    wasm_dest_name = entry or wasm_path.name
    wasm_dest = dist_dir / wasm_dest_name.lstrip("/\\")
    wasm_dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(wasm_path, wasm_dest)

    copy_item(root_dir, dist_dir, icon)

    if isinstance(additional, list):
        for item in additional:
            if item is None:
                continue
            copy_item(root_dir, dist_dir, str(item))

    if args.package:
        package_name = make_package_name(plugin_name, crate_name)
        package_path = dist_dir / f"{package_name}.abp"
        package_dist(dist_dir, package_path)


if __name__ == "__main__":
    main()
