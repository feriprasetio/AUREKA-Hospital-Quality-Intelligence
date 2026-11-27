#!/usr/bin/env bash
set -euo pipefail

chrome=${CHROME_PATH:-}
if [[ -z "$chrome" ]]; then
  chrome=$(command -v google-chrome || command -v chromium || command -v chromium-browser)
fi

scratch_dir=$(mktemp -d)
server_pid=
chrome_pid=
cleanup() {
  if [[ -n "$chrome_pid" ]]; then
    kill "$chrome_pid" 2>/dev/null || true
    wait "$chrome_pid" 2>/dev/null || true
  fi
  if [[ -n "$server_pid" ]]; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
  # Chromium helpers can flush profile files just after the main process exits.
  if ! rm -rf "$scratch_dir" 2>/dev/null; then
    sleep 1
    rm -rf "$scratch_dir" || printf '%s\n' 'Temporary Chromium profile cleanup was incomplete.' >&2
  fi
}
trap cleanup EXIT

project=AUREKA-Hospital-Quality-Intelligence
mkdir "$scratch_dir/site"
ln -s "$PWD/out" "$scratch_dir/site/$project"
python3 -m http.server 3789 --bind 127.0.0.1 --directory "$scratch_dir/site" >"$scratch_dir/http.log" 2>&1 &
server_pid=$!
"$chrome" --headless --no-sandbox --disable-dev-shm-usage --remote-debugging-port=3790 --user-data-dir="$scratch_dir/chrome" about:blank >"$scratch_dir/chrome.log" 2>&1 &
chrome_pid=$!

app_url="http://127.0.0.1:3789/$project/"
cdp_url=http://127.0.0.1:3790
curl --retry 15 --retry-connrefused --retry-delay 1 --fail --silent --show-error --output /dev/null "$app_url"
curl --retry 15 --retry-connrefused --retry-delay 1 --fail --silent --show-error --output /dev/null "$cdp_url/json"
AUREKA_UI_URL="$app_url" AUREKA_CDP_URL="$cdp_url" AUREKA_UI_FOCUSED=1 node scripts/check-workspace-ui.mjs
