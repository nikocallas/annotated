#!/usr/bin/env bash

set -euo pipefail

annotated_env_file="${ANNOTATED_LOCAL_ENV_FILE:-${HOME}/.config/annotated/local.env}"

if [[ ! -f "${annotated_env_file}" ]]; then
  echo "Annotated local environment not found: ${annotated_env_file}" >&2
  echo "Restore it from the local Supabase status output before starting the app." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${annotated_env_file}"
set +a

exec npm run dev
