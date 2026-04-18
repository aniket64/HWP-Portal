#!/usr/bin/env sh
set -eu

BASES="appjRcTYUcy6lmKx2 appSZqcdigG1dhdmu"

# Load .env automatically when token is not already exported.
if [ -z "${AIRTABLE_API_KEY:-}" ] && [ -f ./.env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

if [ -z "${AIRTABLE_API_KEY:-}" ]; then
  echo "ERROR: AIRTABLE_API_KEY is not set."
  echo "Set it for this shell and re-run:"
  echo "  export AIRTABLE_API_KEY=your_key_here"
  echo "Or create .env with AIRTABLE_API_KEY=..."
  exit 2
fi

if [ "$AIRTABLE_API_KEY" = "your_airtable_token_here" ]; then
  echo "ERROR: AIRTABLE_API_KEY is still placeholder value in .env"
  echo "Replace it with a real token and re-run."
  exit 2
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "ERROR: curl is required but not installed."
  exit 3
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required but not installed."
  echo "Install on macOS: brew install jq"
  exit 4
fi

echo "Airtable Metadata Mapping"
echo "========================="

for BASE in $BASES; do
  echo ""
  echo "BASE: $BASE"
  echo "table_id\ttable_name"

  TMP_JSON="$(mktemp)"
  curl -sS "https://api.airtable.com/v0/meta/bases/$BASE/tables" \
    -H "Authorization: Bearer $AIRTABLE_API_KEY" \
    -H "Content-Type: application/json" > "$TMP_JSON"

  if jq -e '.error' "$TMP_JSON" >/dev/null 2>&1; then
    jq -r '.error | "ERROR: " + (.type // "unknown") + " - " + (.message // "no message")' "$TMP_JSON"
    rm -f "$TMP_JSON"
    exit 5
  fi

  if ! jq -e '.tables' "$TMP_JSON" >/dev/null 2>&1; then
    echo "ERROR: Invalid metadata payload for base $BASE"
    rm -f "$TMP_JSON"
    exit 5
  fi

  jq -r '.tables[] | [.id, .name] | @tsv' "$TMP_JSON"
  rm -f "$TMP_JSON"
done
