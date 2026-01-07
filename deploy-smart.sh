#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

print_usage() {
  cat <<'USAGE'
Usage:
  bash deploy-smart.sh [--apply] [--dry-run] [--since <ref>]

What it does:
  - Inspects your local git changes
  - Automatically chooses ONE of:
    - server hotfix (docker cp into running viewer)
    - server docker rebuild (only affected services)

Notes:
  - Default compare range:
    - If upstream exists: @{u}..HEAD
    - Otherwise: HEAD~1..HEAD
  - This script deploys via git push + server-side git pull.

Options:
  --since <ref>  Compare <ref>..HEAD (override default)
  --dry-run      Print the chosen action and files, do not execute anything
  --apply        Actually run the chosen action
  --push-gitee   Also git push to remote 'gitee' (best-effort)

Examples:
  bash deploy-smart.sh --dry-run
  bash deploy-smart.sh --apply
  bash deploy-smart.sh --since origin/main --apply
USAGE
}

APPLY=false
DRY_RUN=false
SINCE_REF=""
PUSH_GITEE=false

while [ $# -gt 0 ]; do
  case "$1" in
    --apply)
      APPLY=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --since)
      shift
      if [ $# -eq 0 ]; then
        echo "ERROR: Missing value for --since <ref>"
        exit 1
      fi
      SINCE_REF="$1"
      shift
      ;;
    --push-gitee)
      PUSH_GITEE=true
      shift
      ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    *)
      echo "ERROR: Unknown arg: $1"
      print_usage
      exit 1
      ;;
  esac
done

if [ "$APPLY" = "false" ] && [ "$DRY_RUN" = "false" ]; then
  echo "ERROR: Please specify one of: --apply or --dry-run"
  print_usage
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "ERROR: git not found"
  exit 1
fi

if [ ! -d .git ]; then
  echo "ERROR: Not a git repository: $SCRIPT_DIR"
  exit 1
fi

SERVER_USER="root"
SERVER_HOST="120.77.222.205"
SSH_PORT="52222"
PROJECT_PATH="~/hotnews"

DEPLOY_BRANCH="main"

REMOTE_ORIGIN="origin"
REMOTE_GITEE="gitee"

resolve_range() {
  if [ -n "$SINCE_REF" ]; then
    echo "$SINCE_REF..HEAD"
    return
  fi

  if git rev-parse --verify --quiet "@{u}" >/dev/null 2>&1; then
    echo "@{u}..HEAD"
    return
  fi

  if git rev-parse --verify --quiet "HEAD~1" >/dev/null 2>&1; then
    echo "HEAD~1..HEAD"
    return
  fi

  echo "HEAD"
}

RANGE="$(resolve_range)"

CHANGED=()
while IFS= read -r f; do
  [ -z "$f" ] && continue
  CHANGED+=("$f")
done < <(git diff --name-only "$RANGE" | sed '/^$/d')

is_ignored_change() {
  local f="$1"
  case "$f" in
    docs/*|openspec/*|*.md|.gitignore|*.sh)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

DEPLOY_CHANGED=()
IGNORED_CHANGED=()
for f in "${CHANGED[@]}"; do
  if is_ignored_change "$f"; then
    IGNORED_CHANGED+=("$f")
  else
    DEPLOY_CHANGED+=("$f")
  fi
done

if [ ${#CHANGED[@]} -eq 0 ]; then
  echo "No changes detected in range: $RANGE"
  exit 0
fi

if [ ${#DEPLOY_CHANGED[@]} -eq 0 ]; then
  printf 'No deploy-relevant changes detected in range: %s\n' "$RANGE"
  exit 0
fi

is_hotfix_allowed_file() {
  local f="$1"
  case "$f" in
    trendradar/web/templates/*|trendradar/web/static/*|trendradar/web/*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

is_static_source_change() {
  local f="$1"
  case "$f" in
    trendradar/web/static/js/src/*|trendradar/web/static/js/modules/*|trendradar/web/static/js/src/*)
      return 0
      ;;
    package.json|package-lock.json)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

is_rebuild_trigger() {
  local f="$1"
  case "$f" in
    docker/Dockerfile*|docker/requirements*.txt|docker/docker-compose*.yml)
      return 0
      ;;
    trendradar/requirements*.txt|requirements*.txt|pyproject.toml|uv.lock|poetry.lock)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

is_config_change() {
  local f="$1"
  case "$f" in
    config/*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

needs_viewer=false
needs_mcp=false
needs_trend_radar=false
needs_rebuild=false
all_hotfix_allowed=true
has_static_source=false
include_config=false
has_non_config_change=false

for f in "${DEPLOY_CHANGED[@]}"; do
  if ! is_hotfix_allowed_file "$f"; then
    all_hotfix_allowed=false
  fi
  if is_static_source_change "$f"; then
    has_static_source=true
  fi
  if is_rebuild_trigger "$f"; then
    needs_rebuild=true
  fi

  if is_config_change "$f"; then
    include_config=true
  else
    has_non_config_change=true
  fi

  case "$f" in
    trendradar/web/*|trendradar/web/templates/*|trendradar/web/static/*|index.html|predeploy-cache-bust.py)
      needs_viewer=true
      ;;
    mcp_server/*)
      needs_mcp=true
      ;;
    trendradar/*)
      needs_trend_radar=true
      ;;
    docker/*)
      # Compose or Dockerfile changes usually affect at least viewer.
      needs_viewer=true
      ;;
  esac

done

# Decision order:
# 1) Any rebuild trigger => rebuild (only affected services)
# 2) Only config changes => restart viewer (no rebuild)
# 3) Web-only changes under hotfix allowed paths => hotfix (optionally build JS locally)
# 4) Fallback => rebuild

ACTION=""

if [ "$needs_rebuild" = "true" ]; then
  ACTION="rebuild"
elif [ "$include_config" = "true" ] && [ "$has_non_config_change" = "false" ]; then
  ACTION="config_restart"
elif [ "$all_hotfix_allowed" = "true" ]; then
  ACTION="hotfix"
else
  ACTION="rebuild"
fi

printf 'Detected changes (range: %s):\n' "$RANGE"
printf '  - %s\n' "${DEPLOY_CHANGED[@]}"
echo ""
echo "Chosen action: ${ACTION}"

if [ "$DRY_RUN" = "true" ]; then
  exit 0
fi

run() {
  echo "+ $*"
  "$@"
}

ensure_clean_worktree() {
  if ! git diff --quiet --; then
    echo "ERROR: You have unstaged changes. Please commit or stash before deploy."
    exit 1
  fi
  if ! git diff --cached --quiet --; then
    echo "ERROR: You have staged but uncommitted changes. Please commit before deploy."
    exit 1
  fi
}

build_js_if_needed() {
  if [ "$has_static_source" != "true" ]; then
    return 0
  fi
  if ! command -v npm >/dev/null 2>&1; then
    echo "ERROR: npm not found but JS source changes detected"
    exit 1
  fi
  if [ ! -f "./package.json" ]; then
    echo "ERROR: package.json not found but JS source changes detected"
    exit 1
  fi
  run npm run -s build:js --if-present
  if [ ! -f "./trendradar/web/static/js/viewer.bundle.js" ]; then
    echo "ERROR: build:js did not produce ./trendradar/web/static/js/viewer.bundle.js"
    exit 1
  fi
}

ensure_js_build_committed_if_needed() {
  if [ "$has_static_source" != "true" ]; then
    return 0
  fi

  build_js_if_needed

  if ! git diff --quiet -- ./trendradar/web/static/js/viewer.bundle.js; then
    echo "ERROR: JS build produced changes in trendradar/web/static/js/viewer.bundle.js"
    echo "Please git add/commit the generated bundle, then re-run deploy-smart.sh"
    exit 1
  fi
}

ssh_opts=(
  -p "${SSH_PORT}"
  -o ControlMaster=auto
  -o ControlPersist=600
  -o ControlPath="/tmp/hotnews-ssh-${SERVER_USER}@${SERVER_HOST}-${SSH_PORT}"
)

remote="${SERVER_USER}@${SERVER_HOST}"

compute_hotfix_files() {
  HOTFIX_FILES=()
  for f in "${DEPLOY_CHANGED[@]}"; do
    # Don't try to hotfix build-time JS sources; we hotfix the built bundle instead.
    case "$f" in
      trendradar/web/static/js/src/*|trendradar/web/static/js/modules/*|package.json|package-lock.json)
        continue
        ;;
    esac
    if is_hotfix_allowed_file "$f"; then
      HOTFIX_FILES+=("$f")
    fi
  done

  if [ "$has_static_source" = "true" ]; then
    # Always push the built bundle.
    HOTFIX_FILES+=("trendradar/web/static/js/viewer.bundle.js")
  fi

  if [ ${#HOTFIX_FILES[@]} -eq 0 ]; then
    echo "ERROR: No hotfix-able files detected"
    exit 1
  fi
}

ensure_js_build_committed_if_needed

ensure_clean_worktree

# Push-first workflow
echo "Pushing HEAD to ${REMOTE_ORIGIN}/${DEPLOY_BRANCH}..."
run git push "${REMOTE_ORIGIN}" "HEAD:${DEPLOY_BRANCH}"

if [ "$PUSH_GITEE" = "true" ] && git remote get-url "${REMOTE_GITEE}" >/dev/null 2>&1; then
  echo "Pushing HEAD to ${REMOTE_GITEE}/${DEPLOY_BRANCH}..."
  run git push "${REMOTE_GITEE}" "HEAD:${DEPLOY_BRANCH}"
fi

remote_path_expanded=$(ssh "${ssh_opts[@]}" -o ConnectTimeout=5 "$remote" "eval echo ${PROJECT_PATH}")
if [ -z "${remote_path_expanded}" ]; then
  echo "ERROR: Failed to resolve remote path: ${PROJECT_PATH}"
  exit 1
fi

echo "Updating server repo (git pull)..."

# The server-side script:
# - cd to repo
# - ensure clean worktree
# - checkout + pull DEPLOY_BRANCH
# - compute changed files (old..new)
# - decide action and execute

ssh "${ssh_opts[@]}" "$remote" bash -s -- "$remote_path_expanded" "${DEPLOY_BRANCH}" <<'ENDSSH'
set -euo pipefail

remote_path_expanded="$1"
deploy_branch="$2"

cd "${remote_path_expanded}"

if [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: Server repo has local modifications. Please clean it before deploy."
  git status --porcelain
  exit 1
fi

git fetch --all --prune
git checkout -q "${deploy_branch}"

old_head=$(git rev-parse HEAD)

git pull --ff-only origin "${deploy_branch}"

new_head=$(git rev-parse HEAD)
if [ "${old_head}" = "${new_head}" ]; then
  echo "No new commits pulled on server. Nothing to deploy."
  exit 0
fi

changed=()
while IFS= read -r f; do
  [ -z "${f}" ] && continue
  changed+=("${f}")
done < <(git diff --name-only "${old_head}..${new_head}" | sed '/^$/d')
if [ ${#changed[@]} -eq 0 ]; then
  echo "No file changes detected on server between ${old_head}..${new_head}"
  exit 0
fi

is_ignored_change() {
  local f="$1"
  case "$f" in
    docs/*|openspec/*|*.md|.gitignore|*.sh)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

deploy_changed=()
ignored_changed=()
for f in "${changed[@]}"; do
  if is_ignored_change "${f}"; then
    ignored_changed+=("${f}")
  else
    deploy_changed+=("${f}")
  fi
done

if [ ${#deploy_changed[@]} -eq 0 ]; then
  printf 'No deploy-relevant changes on server between %s..%s\n' "${old_head}" "${new_head}"
  exit 0
fi

is_hotfix_allowed_file() {
  local f="$1"
  case "$f" in
    trendradar/web/templates/*|trendradar/web/static/*|trendradar/web/*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

is_static_source_change() {
  local f="$1"
  case "$f" in
    trendradar/web/static/js/src/*|trendradar/web/static/js/modules/*|trendradar/web/static/js/src/*)
      return 0
      ;;
    package.json|package-lock.json)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

is_rebuild_trigger() {
  local f="$1"
  case "$f" in
    docker/Dockerfile*|docker/requirements*.txt|docker/docker-compose*.yml)
      return 0
      ;;
    trendradar/requirements*.txt|requirements*.txt|pyproject.toml|uv.lock|poetry.lock)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

is_config_change() {
  local f="$1"
  case "$f" in
    config/*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

needs_viewer=false
needs_mcp=false
needs_trend_radar=false
needs_rebuild=false
all_hotfix_allowed=true
include_config=false
has_non_config_change=false
has_docs_only=true

for f in "${deploy_changed[@]}"; do
  if [ "$f" = "" ]; then
    continue
  fi

  case "$f" in
    docs/*|README.md)
      ;;
    *)
      has_docs_only=false
      ;;
  esac

  if ! is_hotfix_allowed_file "$f"; then
    all_hotfix_allowed=false
  fi
  if is_rebuild_trigger "$f"; then
    needs_rebuild=true
  fi
  if is_config_change "$f"; then
    include_config=true
  else
    has_non_config_change=true
  fi

  case "$f" in
    trendradar/web/*|trendradar/web/templates/*|trendradar/web/static/*|index.html|predeploy-cache-bust.py)
      needs_viewer=true
      ;;
    mcp_server/*)
      needs_mcp=true
      ;;
    trendradar/*)
      needs_trend_radar=true
      ;;
    docker/*)
      needs_viewer=true
      ;;
  esac
done

if [ "${has_docs_only}" = "true" ]; then
  printf 'Only docs/README changed between %s..%s. No deployment action required.\n' "${old_head}" "${new_head}"
  exit 0
fi

# Re-decide action on the server based on the pulled commits.
action=""
if [ "${needs_rebuild}" = "true" ]; then
  action="rebuild"
elif [ "${include_config}" = "true" ] && [ "${has_non_config_change}" = "false" ]; then
  action="config_restart"
elif [ "${all_hotfix_allowed}" = "true" ]; then
  action="hotfix"
else
  # Push-based workflow has no rsync path. If changes are not hotfix-able, rebuild.
  action="rebuild"
fi

printf 'Server pulled commits: %s..%s\n' "${old_head}" "${new_head}"
printf 'Server changed files:\n'
printf '  - %s\n' "${deploy_changed[@]}"
echo ""
echo "Chosen action (server): ${action}"

if [ "${action}" = "config_restart" ]; then
  echo "Restarting viewer on server (config change)..."
  docker restart trend-radar-viewer >/dev/null
  for i in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:8090/health >/dev/null 2>&1; then
      echo "viewer healthy"
      exit 0
    fi
    sleep 1
  done
  echo "ERROR: viewer health check failed"
  exit 1
fi

if [ "${action}" = "hotfix" ]; then
  container_id=$(docker ps -q -f name=^trend-radar-viewer$ | head -n 1 || true)
  if [ -z "${container_id}" ]; then
    echo "ERROR: trend-radar-viewer container is not running"
    exit 1
  fi

  ts=$(date +%Y%m%d%H%M%S)
  backup_dir="${remote_path_expanded}/hotfix_backups/${ts}"
  mkdir -p "${backup_dir}"

  hotfix_files=()
  while IFS= read -r rel; do
    [ -z "${rel}" ] && continue
    # Ignore build-time JS sources; assume built bundle is committed and will be included if needed.
    case "${rel}" in
      trendradar/web/static/js/src/*|trendradar/web/static/js/modules/*|package.json|package-lock.json)
        continue
        ;;
    esac
    if is_hotfix_allowed_file "${rel}"; then
      hotfix_files+=("${rel}")
    fi
  done < <(printf '%s\n' "${deploy_changed[@]}")

  if printf '%s\n' "${deploy_changed[@]}" | grep -qE '^trendradar/web/static/js/(src|modules)/|^package\.json$|^package-lock\.json$'; then
    hotfix_files+=("trendradar/web/static/js/viewer.bundle.js")
  fi

  if [ ${#hotfix_files[@]} -eq 0 ]; then
    echo "ERROR: No hotfix-able files detected on server"
    exit 1
  fi

  echo "Applying hotfix into trend-radar-viewer..."
  for rel in "${hotfix_files[@]}"; do
    src_file="${remote_path_expanded}/${rel}"
    dst_in_container="/app/${rel}"
    backup_file="${backup_dir}/${rel}"
    mkdir -p "$(dirname "${backup_file}")"
    if [ ! -f "${src_file}" ]; then
      echo "ERROR: Source file not found in repo: ${src_file}"
      exit 1
    fi
    docker cp "${container_id}:${dst_in_container}" "${backup_file}" >/dev/null 2>&1 || true
    docker cp "${src_file}" "${container_id}:${dst_in_container}"
  done

  docker restart trend-radar-viewer >/dev/null
  for i in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:8090/health >/dev/null 2>&1; then
      echo "viewer healthy"
      exit 0
    fi
    sleep 1
  done
  echo "ERROR: viewer health check failed after hotfix"
  exit 1
fi

# action=rebuild
services=()
if [ "${needs_trend_radar}" = "true" ]; then
  services+=("trend-radar")
fi
if [ "${needs_viewer}" = "true" ]; then
  services+=("trend-radar-viewer")
fi
if [ "${needs_mcp}" = "true" ]; then
  services+=("trend-radar-mcp")
fi

if [ ${#services[@]} -eq 0 ]; then
  services=("trend-radar-viewer")
fi

svc_list=$(printf '%s ' "${services[@]}")

cd "${remote_path_expanded}/docker"

echo "docker compose build: ${svc_list}"
docker compose -f docker-compose-build.yml build ${svc_list}

echo "docker compose up -d --force-recreate: ${svc_list}"
docker compose -f docker-compose-build.yml up -d --force-recreate ${svc_list}

if echo "${svc_list}" | grep -q "trend-radar-viewer"; then
  echo "Health checking viewer..."
  for i in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:8090/health >/dev/null 2>&1; then
      echo "viewer healthy"
      exit 0
    fi
    sleep 1
  done
  echo "ERROR: viewer health check failed"
  exit 1
fi

echo "rebuild done"
ENDSSH

