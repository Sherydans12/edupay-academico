#!/usr/bin/env bash
set -euo pipefail

# This script creates backup artifacts only. It never prints connection URLs or secret values.
: "${ACADEMIC_DATABASE_URL:?set a server-side Academic PostgreSQL URL}"
: "${IDENTITY_DATABASE_URL:?set a server-side Identity PostgreSQL URL}"
: "${ACADEMIC_STORAGE_ROOT:?set the mounted private Academic file root}"
: "${ACADEMIC_STORAGE_TEMP_ROOT:?set the separate Academic staging root}"
: "${BACKUP_ROOT:?set an off-host or backup-mounted destination}"

if [[ "$ACADEMIC_STORAGE_ROOT" == "$ACADEMIC_STORAGE_TEMP_ROOT" ]]; then
  echo "Backup refused: final and staging storage roots must be separate." >&2
  exit 1
fi

final_root="$(realpath -m "$ACADEMIC_STORAGE_ROOT")"
temp_root="$(realpath -m "$ACADEMIC_STORAGE_TEMP_ROOT")"
backup_root="$(realpath -m "$BACKUP_ROOT")"

is_same_or_below() {
  local parent="$1"
  local candidate="$2"
  [[ "$candidate" == "$parent" || "$candidate" == "$parent"/* ]]
}

if is_same_or_below "$final_root" "$backup_root" || \
  is_same_or_below "$temp_root" "$backup_root" || \
  is_same_or_below "$backup_root" "$final_root" || \
  is_same_or_below "$backup_root" "$temp_root"; then
  echo "Backup refused: backup target must be separate from final and staging storage roots." >&2
  exit 1
fi

if [[ ! -d "$ACADEMIC_STORAGE_ROOT" || ! -r "$ACADEMIC_STORAGE_ROOT" ]]; then
  echo "Backup refused: Academic file root is unavailable." >&2
  exit 1
fi

umask 077
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$BACKUP_ROOT/$stamp"
mkdir -p "$target"
chmod 700 "$target"
cleanup() {
  rm -f "$target"/*.partial
}
trap cleanup EXIT

pg_dump --format=custom --no-owner --no-privileges --file="$target/identity.postgres.dump.partial" "$IDENTITY_DATABASE_URL"
mv "$target/identity.postgres.dump.partial" "$target/identity.postgres.dump"

pg_dump --format=custom --no-owner --no-privileges --file="$target/academico.postgres.dump.partial" "$ACADEMIC_DATABASE_URL"
mv "$target/academico.postgres.dump.partial" "$target/academico.postgres.dump"

tar --create --gzip --file="$target/academico-private-files.tar.gz.partial" \
  --directory="$ACADEMIC_STORAGE_ROOT" .
mv "$target/academico-private-files.tar.gz.partial" "$target/academico-private-files.tar.gz"

if [[ -n "${DEPLOYMENT_INVENTORY_PATH:-}" && -f "$DEPLOYMENT_INVENTORY_PATH" ]]; then
  cp --no-preserve=mode,ownership "$DEPLOYMENT_INVENTORY_PATH" "$target/deployment-inventory.example"
fi

sha256sum "$target"/* > "$target/SHA256SUMS"
printf 'Backup complete: %s\n' "$target"
printf 'Keep at least %s dated restore points and copy this directory off the live host.\n' "${MIN_RESTORE_POINTS:-7}"
