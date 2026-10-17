#!/usr/bin/env bash

set -euo pipefail

annotated_env_dir="${HOME}/.config/annotated"
annotated_env_file="${ANNOTATED_LOCAL_ENV_FILE:-${annotated_env_dir}/local.env}"
annotated_status="$(supabase status --workdir .. --output env 2>/dev/null)"

read_status_value() {
  local variable_name="$1"
  printf '%s\n' "${annotated_status}" | sed -n "s/^${variable_name}=\"\(.*\)\"$/\1/p"
}

annotated_api_url="$(read_status_value API_URL)"
annotated_publishable_key="$(read_status_value PUBLISHABLE_KEY)"
annotated_secret_key="$(read_status_value SECRET_KEY)"

if [[ -z "${annotated_api_url}" || -z "${annotated_publishable_key}" || -z "${annotated_secret_key}" ]]; then
  echo "Local Supabase is not ready. Run npm run supabase:start first." >&2
  exit 1
fi

mkdir -p "${annotated_env_dir}"
chmod 700 "${annotated_env_dir}"
umask 077

annotated_temp_file="$(mktemp "${annotated_env_file}.XXXXXX")"
trap 'rm -f "${annotated_temp_file}"' EXIT

{
  printf 'SUPABASE_URL=%s\n' "${annotated_api_url}"
  printf 'SUPABASE_ANON_KEY=%s\n' "${annotated_publishable_key}"
  printf 'SUPABASE_SERVICE_ROLE_KEY=%s\n' "${annotated_secret_key}"
  printf 'VITE_SUPABASE_URL=%s\n' "${annotated_api_url}"
  printf 'VITE_SUPABASE_PUBLISHABLE_KEY=%s\n' "${annotated_publishable_key}"
  printf 'MODERATOR_AUTH_IDS=00000000-0000-0000-0000-000000000000\n'
  printf 'CRON_SECRET=annotated-local-cron-only\n'
  printf 'RATE_LIMIT_SALT=annotated-local-rate-limit-only\n'
  printf 'ALLOWED_ORIGINS=http://127.0.0.1:5001,http://localhost:5001\n'
  printf 'PORT=5001\n'
} > "${annotated_temp_file}"

mv "${annotated_temp_file}" "${annotated_env_file}"
trap - EXIT
chmod 600 "${annotated_env_file}"

echo "Configured Annotated local environment at ${annotated_env_file}"
