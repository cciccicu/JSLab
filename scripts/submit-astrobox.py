#!/usr/bin/env python3
"""Publish JSLab Community RPKs and submit an update to AstroBox-Repo.

Python 3.10+ and Git are sufficient; see docs/development/astrobox-resources.md.
"""

import argparse
import base64
import copy
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
import urllib.error
import urllib.parse
import urllib.request
import zipfile


ROOT = Path(__file__).resolve().parents[1]
RESOURCE_REPO = "cciccicu/JSLab_AstroBox_Release"
UPSTREAM = "AstralSightStudios/AstroBox-Repo"
RESOURCE_ID = "icu.ccicc.jslab"
MANIFEST = "manifest_v2.json"
COLUMNS = (
    "id", "name", "restype", "repo_owner", "repo_name", "repo_commit_hash",
    "icon", "cover", "tags", "device_vendors", "devices", "paid_type",
)
DEVICES = {"xmb9p": "Pro", "xmb10p": "Pro", "xmrw5": "RW",
           "xmrw5xring": "RW", "xmrw6": "RW"}
WIDTHS = {"Pro": 336, "RW": 432}


class PublishError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise PublishError(message)


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def blob_sha(data):
    return hashlib.sha1(f"blob {len(data)}\0".encode("ascii") + data).hexdigest()


def github_token():
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if token:
        return token
    result = subprocess.run(
        ["git", "credential", "fill"], input="protocol=https\nhost=github.com\n\n",
        text=True, encoding="utf-8", capture_output=True, timeout=30,
        env=dict(os.environ, GIT_TERMINAL_PROMPT="0", GCM_INTERACTIVE="never"),
    )
    credentials = dict(line.split("=", 1) for line in result.stdout.splitlines() if "=" in line)
    require(result.returncode == 0 and credentials.get("password"),
            "请先通过 Git Credential Manager 登录 GitHub，或设置 GH_TOKEN。")
    return credentials["password"]


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class GitHub:
    def __init__(self, token, proxy=None):
        self.token = token
        self.proxy = {"https": proxy, "http": proxy} if proxy else {}

    def api(self, path, method="GET", body=None, optional=False):
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2026-03-10",
            "User-Agent": "JSLab-AstroBox-Submit/1",
        }
        data = None if body is None else json_bytes(body)
        if data is not None:
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request("https://api.github.com" + path,
                                         data=data, headers=headers, method=method)
        opener = urllib.request.build_opener(urllib.request.ProxyHandler(self.proxy), NoRedirect())
        try:
            with opener.open(request, timeout=45) as response:
                raw = response.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as error:
            if optional and error.code == 404:
                return None
            detail = error.read().decode("utf-8", errors="replace")
            raise PublishError(f"GitHub {method} {path}: HTTP {error.code}\n{detail[:800]}") from error
        except (urllib.error.URLError, OSError) as error:
            raise PublishError(f"GitHub {method} {path}: {error}") from error

    def pages(self, path):
        separator = "&" if "?" in path else "?"
        page = 1
        while True:
            rows = self.api(f"{path}{separator}per_page=100&page={page}")
            yield from rows
            if len(rows) < 100:
                return
            page += 1

    def file(self, repo, path, ref, optional=False):
        path = urllib.parse.quote(path, safe="/")
        data = self.api(f"/repos/{repo}/contents/{path}?ref={urllib.parse.quote(ref, safe='')}",
                        optional=optional)
        if data is None:
            return None
        require(data.get("encoding") == "base64", f"无法读取 {repo}/{path}。")
        return base64.b64decode(data["content"])

    def snapshot(self, repo, ref):
        commit = self.api(f"/repos/{repo}/commits/{urllib.parse.quote(ref, safe='')}")
        tree_sha = commit["commit"]["tree"]["sha"]
        tree = self.api(f"/repos/{repo}/git/trees/{tree_sha}?recursive=1")
        require(not tree.get("truncated"), f"{repo} 文件列表被截断。")
        return {"sha": commit["sha"], "tree": tree_sha,
                "files": {item["path"]: item["sha"] for item in tree["tree"] if item["type"] == "blob"}}

    def commit(self, repo, branch, snapshot, files, message, create=False):
        changed = {path: data for path, data in files.items()
                   if snapshot["files"].get(path) != blob_sha(data)}
        if not changed:
            return snapshot["sha"]
        if create:
            # Make the upstream commit reachable in the fork before using its tree.
            self.api(f"/repos/{repo}/git/refs", "POST", {
                "ref": f"refs/heads/{branch}", "sha": snapshot["sha"],
            })

        def upload(item):
            path, data = item
            blob = self.api(f"/repos/{repo}/git/blobs", "POST", {
                "encoding": "base64", "content": base64.b64encode(data).decode("ascii"),
            })
            require(blob["sha"] == blob_sha(data), f"上传校验失败：{path}")
            return {"path": path, "mode": "100644", "type": "blob", "sha": blob["sha"]}

        with ThreadPoolExecutor(max_workers=3) as pool:
            entries = list(pool.map(upload, changed.items()))
        tree = self.api(f"/repos/{repo}/git/trees", "POST", {
            "base_tree": snapshot["tree"], "tree": entries,
        })
        commit = self.api(f"/repos/{repo}/git/commits", "POST", {
            "message": message, "tree": tree["sha"], "parents": [snapshot["sha"]],
        })
        self.api(f"/repos/{repo}/git/refs/heads/{branch}", "PATCH", {
            "sha": commit["sha"], "force": False,
        })
        verified = self.snapshot(repo, commit["sha"])
        require(all(verified["files"].get(path) == blob_sha(data) for path, data in files.items()),
                f"{repo} 提交后的文件校验失败。")
        return commit["sha"]


def read_packages(directory, version):
    packages = {}
    for device, width in WIDTHS.items():
        path = directory / f"JSLab-Community-{device}-{version}.rpk"
        data = path.read_bytes()
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            require(archive.testzip() is None, f"RPK ZIP 校验失败：{path.name}")
            require("META-INF/CERT" in archive.namelist(), f"缺少签名证书：{path.name}")
            manifest = json.loads(archive.read("manifest.json"))
        require(manifest.get("package") == RESOURCE_ID and manifest.get("name") == "JSLab社区版",
                f"{path.name} 必须是 JSLab 社区版。")
        require(manifest.get("versionName") == version, f"包内版本与参数不一致：{path.name}")
        require(manifest.get("config", {}).get("designWidth") == width, f"设备布局不匹配：{path.name}")
        code = manifest.get("versionCode")
        require(type(code) is int and code > 0, f"无效的 versionCode：{path.name}")
        packages[device] = {"path": f"downloads/{path.name}", "data": data, "code": code,
                            "sha256": hashlib.sha256(data).hexdigest()}
    require(packages["Pro"]["code"] == packages["RW"]["code"], "Pro 和 RW 的 versionCode 必须一致。")
    return packages


def catalog_entry(raw):
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8")))
    require(reader.fieldnames == list(COLUMNS), "官方 CSV 格式已变化，请先更新脚本。")
    matches = [row for row in reader if row["id"].strip() == RESOURCE_ID]
    require(len(matches) == 1, f"官方源中应有唯一的 {RESOURCE_ID} 条目。")
    row = matches[0]
    require(f"{row['repo_owner']}/{row['repo_name']}".lower() == RESOURCE_REPO.lower(),
            "官方源绑定的资源仓库发生变化，请核对后更新脚本。")
    require(row["restype"] == "quick_app" and not row["paid_type"], "脚本用于现有免费快应用条目。")
    return row


def update_manifest(original, entry, packages, version, notes, remote_files):
    item = original["item"]
    for key in ("id", "name", "restype", "icon", "cover"):
        require(item[key] == entry[key], f"manifest 的 {key} 与官方目录不同，请先处理元数据变更。")
    downloads = original["downloads"]
    require(set(downloads) == set(entry["devices"].split(";")), "manifest 与官方目录的设备列表不一致。")
    require(set(downloads) <= DEVICES.keys(), "发现未配置的设备，请先补充脚本中的设备映射。")
    result = copy.deepcopy(original)
    for device, current in downloads.items():
        package = packages[DEVICES[device]]
        old_code = current.get("versionCode")
        require(type(old_code) is int and package["code"] >= old_code,
                f"{device} 的 versionCode 必须不低于已发布版本 {old_code}。")
        same_version = current["version"] == version and old_code == package["code"]
        if package["code"] == old_code:
            require(same_version and remote_files.get(current["file_name"]) == blob_sha(package["data"]),
                    f"{device} 的同一 versionCode 已对应其他包，请先增加版本号并重新打包。")
        require(notes or same_version, "新版本需要 --notes-file 指定 UTF-8 更新说明。")
        updated = result["downloads"][device]
        updated.update(version=version, versionCode=package["code"], file_name=package["path"])
        if notes:
            updated["updatelogs"] = [{"version": version, "content": notes}] + [
                log for log in current.get("updatelogs", []) if log["version"] != version
            ]
    return result


def submission_files(entry, resource_sha, upstream_sha, directory):
    row = dict(entry, repo_commit_hash=resource_sha[:7])
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=COLUMNS, lineterminator="\n")
    writer.writeheader()
    writer.writerow(row)
    digest = hashlib.sha256(",".join(entry[key].strip() for key in COLUMNS).encode("utf-8")).hexdigest()
    request = {"schema_version": 1, "mode": "edit", "original_id": RESOURCE_ID,
               "base_entry_digest": digest, "base_catalog_commit": upstream_sha, "client": None}
    return {f"{directory}/resource.csv": buffer.getvalue().encode("utf-8"),
            f"{directory}/request.json": json_bytes(request)}


def pending_submission(github, login, directory):
    # Listing PRs avoids search-index delay on an immediate repeat submission.
    pulls = list(github.pages(f"/repos/{UPSTREAM}/pulls?state=open"))

    def matching(pull):
        if pull["user"]["login"].lower() != login.lower():
            return None
        files = list(github.pages(f"/repos/{UPSTREAM}/pulls/{pull['number']}/files"))
        if not any(file["filename"].startswith(directory + "/") for file in files):
            return None
        expected = {f"{directory}/resource.csv", f"{directory}/request.json"}
        require({file["filename"] for file in files} == expected,
                f"已有 PR #{pull['number']} 包含其他变更，请先处理该 PR。")
        return pull

    with ThreadPoolExecutor(max_workers=4) as pool:
        matches = [pull for pull in pool.map(matching, pulls) if pull]
    require(len(matches) <= 1, "同一资源存在多个待审核 PR，请先合并为一个提交。")
    return matches[0] if matches else None


def pull_body(version, packages, notes, resource_sha):
    lines = [f"更新现有资源 **JSLab社区版**（`{RESOURCE_ID}`）到 **{version}**。", "",
             f"资源提交：[{RESOURCE_REPO}@{resource_sha[:7]}](https://github.com/{RESOURCE_REPO}/commit/{resource_sha})",
             "", "保留原有资源介绍、图片、作者、标签及设备列表。", "",
             "| 安装包 | 适用设备 | SHA-256 |", "| --- | --- | --- |"]
    for target, package in packages.items():
        devices = "、".join(device for device, group in DEVICES.items() if group == target)
        lines.append(f"| {Path(package['path']).name} | {devices} | `{package['sha256']}` |")
    if notes:
        lines += ["", "更新内容：", "", notes]
    lines += ["", "已核对 RPK 包名、社区版标识、版本、设备布局与 ZIP 完整性，上传后核对 Git blob 摘要。",
              "", "由 [JSLab 提交脚本](https://github.com/cciccicu/JSLab/blob/master/scripts/submit-astrobox.py)"
              " 按 schema_version 1 提交更新请求。"]
    return "\n".join(lines) + "\n"


def publish(args):
    require(re.fullmatch(r"\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?", args.version), "版本应为 2.0.7 这样的格式。")
    packages = read_packages(args.package_dir, args.version)
    notes = args.notes_file.read_text(encoding="utf-8-sig").strip() if args.notes_file else None
    require(args.notes_file is None or notes, "更新说明文件不能为空。")
    github = GitHub(github_token(), args.proxy)
    print("读取官方目录与资源仓库……", flush=True)
    with ThreadPoolExecutor(max_workers=3) as pool:
        user_job = pool.submit(github.api, "/user")
        resource_job = pool.submit(github.snapshot, RESOURCE_REPO, "main")
        upstream_job = pool.submit(github.snapshot, UPSTREAM, "main")
        user, resource, upstream = user_job.result(), resource_job.result(), upstream_job.result()
    login = user["login"]
    directory = f"tmp/{login.lower()}/{RESOURCE_REPO.split('/')[1].lower()}"
    require(not any(path.startswith(directory + "/") for path in upstream["files"]),
            "上一条提交已合并，官方源正在处理，请等待处理完成后再运行。")
    with ThreadPoolExecutor(max_workers=3) as pool:
        entry_job = pool.submit(github.file, UPSTREAM, "index_v2.csv", upstream["sha"])
        manifest_job = pool.submit(github.file, RESOURCE_REPO, MANIFEST, resource["sha"])
        pending_job = pool.submit(pending_submission, github, login, directory)
        entry = catalog_entry(entry_job.result())
        original = json.loads(manifest_job.result())
        pending = pending_job.result()
    manifest = update_manifest(original, entry, packages, args.version, notes, resource["files"])
    files = {package["path"]: package["data"] for package in packages.values()}
    if manifest != original:
        files[MANIFEST] = json_bytes(manifest)
    changed = [path for path, data in files.items() if resource["files"].get(path) != blob_sha(data)]
    for target, package in packages.items():
        print(f"{target}: {package['path']} ({len(package['data']):,} bytes, versionCode {package['code']})")
        print(f"  SHA-256 {package['sha256']}")
    print(f"资源仓库：{RESOURCE_REPO}@{resource['sha'][:7]}，需更新 {len(changed)} 个文件")
    print(f"官方源：{entry['name']}，mode=edit，{directory}")
    if pending:
        print(f"待审核 PR：{pending['html_url']}")
        previous = catalog_entry(github.file(pending["head"]["repo"]["full_name"],
                                            directory + "/resource.csv", pending["head"]["sha"]))
        require(all(previous[key] == entry[key] for key in COLUMNS if key != "repo_commit_hash"),
                "待审核 PR 还包含元数据变更，请先处理该 PR 后再自动更新安装包。")
        previous_request = json.loads(github.file(pending["head"]["repo"]["full_name"],
                                                directory + "/request.json", pending["head"]["sha"]))
        require(previous_request.get("mode") == "edit" and previous_request.get("original_id") == RESOURCE_ID,
                "已有 PR 的请求类型不是当前资源的更新。")
    if not changed and resource["sha"].startswith(entry["repo_commit_hash"]) and not pending:
        print("官方源已经引用当前资源提交，无需重复提交。")
        return
    if args.dry_run:
        print("预览完成；未向 GitHub 写入任何内容。")
        return

    fork_repo = f"{login}/AstroBox-Repo"
    fork = github.api(f"/repos/{fork_repo}", optional=True)
    if fork is None:
        fork = github.api(f"/repos/{UPSTREAM}/forks", "POST", {"default_branch_only": True})
        raise PublishError(f"已创建 Fork {fork['html_url']}；GitHub 完成初始化后重新运行此命令。")
    require(fork.get("parent", {}).get("full_name", "").lower() == UPSTREAM.lower(),
            f"{fork_repo} 不是官方源的 Fork。")
    resource_info = github.api(f"/repos/{RESOURCE_REPO}")
    require(resource_info.get("permissions", {}).get("push"), f"当前账户无权更新 {RESOURCE_REPO}。")

    print("上传社区版资源……" if changed else "复用已上传的社区版资源。", flush=True)
    resource_sha = github.commit(RESOURCE_REPO, "main", resource, files,
                                 f"release: JSLab Community {args.version}")
    print(f"资源提交：https://github.com/{RESOURCE_REPO}/commit/{resource_sha}", flush=True)
    # Refresh the catalog after the upload so the digest names the current official entry.
    upstream = github.snapshot(UPSTREAM, "main")
    latest = catalog_entry(github.file(UPSTREAM, "index_v2.csv", upstream["sha"]))
    require(latest == entry, "上传期间官方条目已变化；资源包已保存，请重新运行以读取最新目录。")
    require(not any(path.startswith(directory + "/") for path in upstream["files"]),
            "上一条提交已合并，官方源正在处理，请等待处理完成后再运行。")
    payload = submission_files(entry, resource_sha, upstream["sha"], directory)
    title = f"[JSLab] Update resource: {entry['name']} {args.version}"
    release_notes = notes or next((log["content"] for download in manifest["downloads"].values()
                                  for log in download.get("updatelogs", [])
                                  if log["version"] == args.version), None)
    body = pull_body(args.version, packages, release_notes, resource_sha)
    if pending:
        require(pending["head"]["repo"]["full_name"].lower() == fork_repo.lower(), "待审核 PR 不属于当前 Fork。")
        branch = pending["head"]["ref"]
        base = github.snapshot(fork_repo, branch)
        require(base["sha"] == pending["head"]["sha"], "待审核分支已变化，请重新运行。")
        request_path = directory + "/request.json"
        request = json.loads(payload[request_path])
        if previous_request.get("base_entry_digest") == request["base_entry_digest"]:
            # Unrelated catalog updates do not invalidate this resource's original baseline.
            request["base_catalog_commit"] = previous_request["base_catalog_commit"]
            payload[request_path] = json_bytes(request)
        submission_sha = github.commit(fork_repo, branch, base, payload, f"update: {RESOURCE_ID} {args.version}")
        metadata_changed = pending["title"] != title or pending.get("body", "").replace("\r\n", "\n") != body
        if metadata_changed:
            github.api(f"/repos/{UPSTREAM}/pulls/{pending['number']}", "PATCH", {"title": title, "body": body})
        status = "已更新待审核 PR" if submission_sha != base["sha"] or metadata_changed else "已有相同的待审核 PR，无需重复提交"
        print(f"{status}：{pending['html_url']}")
        return

    branch = f"codex/jslab-{args.version}-{resource_sha[:7]}"
    ref = github.api(f"/repos/{fork_repo}/git/ref/heads/{branch}", optional=True)
    if ref:
        closed = list(github.pages(
            f"/repos/{UPSTREAM}/pulls?state=closed&head={urllib.parse.quote(login + ':' + branch)}"))
        require(not closed, "此提交已有已关闭的 PR，请在原 PR 中处理审核意见。")
        base = github.snapshot(fork_repo, ref["object"]["sha"])
        comparison = github.api(f"/repos/{fork_repo}/compare/{upstream['sha']}...{base['sha']}")
        request_path = directory + "/request.json"
        if request_path not in base["files"]:
            require(not comparison["files"], "未完成的提交分支包含其他变更，请先核对该分支。")
            github.api(f"/repos/{fork_repo}/git/refs/heads/{branch}", "PATCH", {
                "sha": upstream["sha"], "force": False,
            })
            github.commit(fork_repo, branch, upstream, payload, f"submit: {RESOURCE_ID} {args.version}")
        else:
            saved = json.loads(github.file(fork_repo, request_path, base["sha"]))
            request = json.loads(payload[request_path])
            if saved.get("base_entry_digest") == request["base_entry_digest"]:
                request["base_catalog_commit"] = saved["base_catalog_commit"]
                payload[request_path] = json_bytes(request)
            require(all(base["files"].get(path) == blob_sha(data) for path, data in payload.items()),
                    f"恢复分支 {branch} 与当前提交内容不同，请核对该分支。")
            require({file["filename"] for file in comparison["files"]} == set(payload),
                    "恢复分支中存在提交文件之外的变更，请先核对该分支。")
    else:
        # Forks share Git objects: branch directly from upstream, leaving the fork's main untouched.
        github.commit(fork_repo, branch, upstream, payload,
                      f"submit: {RESOURCE_ID} {args.version}", create=True)
    pull = github.api(f"/repos/{UPSTREAM}/pulls", "POST", {
        "title": title,
        "head": f"{login}:{branch}", "base": "main",
        "body": body,
        "maintainer_can_modify": True,
    })
    print(f"已提交，等待官方审核：{pull['html_url']}")


def main():
    parser = argparse.ArgumentParser(description="更新现有 JSLab 社区版资源并向 AstroBox 官方源提交 PR。")
    parser.add_argument("--version", required=True, help="已构建的设备端版本，例如 2.0.7")
    parser.add_argument("--notes-file", type=Path, help="UTF-8 更新说明；新版本必填")
    parser.add_argument("--package-dir", type=Path, default=ROOT / "vela-quickapp/release-archive",
                        help="Pro / RW 社区版 RPK 所在目录")
    parser.add_argument("--dry-run", action="store_true", help="读取、校验并预览，不写入 GitHub")
    parser.add_argument("--proxy", help="显式使用 HTTP 代理，例如 http://127.0.0.1:7890；默认直连")
    args = parser.parse_args()
    try:
        publish(args)
    except (PublishError, OSError, ValueError, KeyError, zipfile.BadZipFile,
            subprocess.SubprocessError, urllib.error.URLError) as error:
        print(f"提交失败：{error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
