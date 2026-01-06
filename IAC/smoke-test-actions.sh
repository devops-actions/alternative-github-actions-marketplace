#!/usr/bin/env bash
set -eo pipefail

function usage {
  echo "Usage: $0 <function-host> <function-key>" >&2
  exit 2
}

if [ $# -lt 2 ]; then
  usage
fi

function_host="$1"
function_key="$2"

if [ -z "$function_host" ] || [ -z "$function_key" ]; then
  echo "Function host or key is empty." >&2
  usage
fi

payload='{"owner":"smoke-test","name":"workflow-status","url":"https://example.com","description":"Smoke test payload"}'
max_attempts=5
attempt=1
response_file=$(mktemp)
trap 'rm -f "$response_file"' EXIT

while [ "$attempt" -le "$max_attempts" ]; do
  curl_exit=0
  http_status=$(curl -sS -w "%{http_code}" -o "$response_file" -X POST "https://${function_host}/api/ActionsUpsert?code=${function_key}" \
    -H "Content-Type: application/json" \
    -d "$payload") || curl_exit=$?

  if [ "$curl_exit" -ne 0 ]; then
    http_status=""
  fi

  owner_value=""
  if [ "$curl_exit" -eq 0 ]; then
    owner_value=$(python3 - "$response_file" <<'PY'
import json, sys
from pathlib import Path
path = Path(sys.argv[1])
try:
    data = json.loads(path.read_text(encoding='utf-8'))
    print(data.get('owner', ''))
except Exception:
    pass
PY
)
  fi

  if [ "$curl_exit" -eq 0 ] && { [ "$http_status" = "200" ] || [ "$http_status" = "201" ]; } && [ "$owner_value" = "smoke-test" ]; then
    echo "Smoke test succeeded with status $http_status."
    python3 - "$response_file" <<'PY'
import json, sys
from pathlib import Path
path = Path(sys.argv[1])
with path.open('r', encoding='utf-8') as infile:
    json.dump(json.load(infile), sys.stdout, indent=2)
    sys.stdout.write('\n')
PY
    exit 0
  fi

  if [ "$attempt" -lt "$max_attempts" ]; then
    echo "Attempt $attempt failed with status ${http_status:-n/a}. Retrying in 10 seconds..."
    sleep 10
  fi
  attempt=$((attempt + 1))
done

echo "Smoke test failed after $max_attempts attempts." >&2
if [ -s "$response_file" ]; then
  echo "Last response payload:" >&2
  cat "$response_file" >&2
fi
exit 1
