#!/bin/bash

set -u

UPDATE_REMOTE="${OJAF_UPDATE_REMOTE:-origin}"
UPDATE_BRANCH="${OJAF_UPDATE_BRANCH:-main}"
SKIP_OPEN="${OJAF_SKIP_OPEN_EXTENSIONS:-0}"
NO_PAUSE="${OJAF_NO_PAUSE:-0}"

finish() {
  local exit_code=$?
  trap - EXIT
  if [[ -t 0 && "$NO_PAUSE" != "1" ]]; then
    echo
    read -r -p "按回车键关闭窗口..." _unused
  fi
  exit "$exit_code"
}
trap finish EXIT

fail() {
  echo "错误：$*" >&2
  exit 1
}

read_manifest_version() {
  sed -nE 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' "$1" | head -n 1
}

open_extension_manager() {
  local app=""
  local url=""
  local candidate=""

  for candidate in "Google Chrome|chrome://extensions/" "Brave Browser|brave://extensions/" "Microsoft Edge|edge://extensions/"; do
    app="${candidate%%|*}"
    url="${candidate#*|}"
    if open -Ra "$app" >/dev/null 2>&1; then
      if ! open -a "$app" "$url" >/dev/null 2>&1; then
        open -a "$app" --args "$url" >/dev/null 2>&1 || true
      fi
      echo "已打开 $app 的扩展管理页。"
      return 0
    fi
  done

  echo "未检测到 Chrome、Brave 或 Edge，请手动打开浏览器扩展管理页。"
}

command -v git >/dev/null 2>&1 || fail "没有找到 Git，请先安装 Git。"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)" || fail "无法定位更新脚本目录。"
REPO_ROOT="$(git -C "$SCRIPT_DIR/.." rev-parse --show-toplevel 2>/dev/null)" || fail "脚本不在 Git 仓库中。请用 git clone 获取完整项目。"
MANIFEST_PATH="$REPO_ROOT/manifest.json"

[[ -f "$MANIFEST_PATH" ]] || fail "未找到 manifest.json：$MANIFEST_PATH"

echo "OpenJobAutofill 本地更新"
echo "项目目录：$REPO_ROOT"

CURRENT_BRANCH="$(git -C "$REPO_ROOT" branch --show-current)" || fail "无法读取当前 Git 分支。"
[[ -n "$CURRENT_BRANCH" ]] || fail "当前处于 detached HEAD，已停止更新。"
[[ "$CURRENT_BRANCH" == "$UPDATE_BRANCH" ]] || fail "当前分支是 $CURRENT_BRANCH，应为 $UPDATE_BRANCH。请先切换到 $UPDATE_BRANCH。"

git -C "$REPO_ROOT" remote get-url "$UPDATE_REMOTE" >/dev/null 2>&1 || fail "未找到远程仓库 $UPDATE_REMOTE。"

WORKTREE_STATUS="$(git -C "$REPO_ROOT" status --porcelain --untracked-files=normal)" || fail "无法检查工作区状态。"
if [[ -n "$WORKTREE_STATUS" ]]; then
  echo "检测到未提交修改，为避免覆盖文件，本次更新已停止：" >&2
  printf '%s\n' "$WORKTREE_STATUS" >&2
  echo "请先提交、暂存到其他位置或删除这些修改后再更新。" >&2
  exit 2
fi

BEFORE_VERSION="$(read_manifest_version "$MANIFEST_PATH")"
BEFORE_COMMIT="$(git -C "$REPO_ROOT" rev-parse --short HEAD)" || fail "无法读取当前提交。"

echo "当前版本：${BEFORE_VERSION:-未知} ($BEFORE_COMMIT)"
echo "正在从 $UPDATE_REMOTE/$UPDATE_BRANCH 获取更新..."

git -C "$REPO_ROOT" pull --ff-only "$UPDATE_REMOTE" "$UPDATE_BRANCH" || fail "Git 更新失败。工作区没有被自动覆盖，请查看上方 Git 错误。"

AFTER_VERSION="$(read_manifest_version "$MANIFEST_PATH")"
AFTER_COMMIT="$(git -C "$REPO_ROOT" rev-parse --short HEAD)" || fail "无法读取更新后的提交。"

if [[ "$BEFORE_COMMIT" == "$AFTER_COMMIT" ]]; then
  echo "已经是最新版本：${AFTER_VERSION:-未知} ($AFTER_COMMIT)"
else
  echo "更新完成：${BEFORE_VERSION:-未知} → ${AFTER_VERSION:-未知}"
  echo "提交变化：$BEFORE_COMMIT → $AFTER_COMMIT"
fi

echo
echo "接下来请在扩展管理页找到 OpenJobAutofill，点击“重新加载”，再刷新招聘网页。"
echo "不要删除并重新安装扩展；直接重新加载可以保留本机资料。"

if [[ "$SKIP_OPEN" != "1" ]]; then
  open_extension_manager
fi

