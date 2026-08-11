#!/usr/bin/env bash
set -euo pipefail

# Deliberately refuses an ambiguous or live restore. Use only a disposable PostgreSQL
# target and a storage directory below the declared restore work directory.
: "${RESTORE_CONFIRM:?set RESTORE_CONFIRM=I_UNDERSTAND_DISPOSABLE_RESTORE}"
: "${RESTORE_WORKDIR:?set a disposable restore work directory}"
: "${RESTORE_TARGET_LABEL:?set a label containing disposable or staging}"
: "${IDENTITY_DATABASE_URL:?set the disposable Identity restore URL}"
: "${ACADEMIC_DATABASE_URL:?set the disposable Academic restore URL}"
: "${ACADEMIC_STORAGE_ROOT:?set the disposable Academic file restore root}"
: "${IDENTITY_DB_DUMP:?set the Identity dump path}"
: "${ACADEMIC_DB_DUMP:?set the Academic dump path}"
: "${ACADEMIC_FILES_ARCHIVE:?set the private file archive path}"
: "${IDENTITY_HEALTH_URL:?set the Identity health URL}"
: "${ACADEMIC_READY_URL:?set the Academic readiness URL}"

restore_workdir="$(realpath -m "$RESTORE_WORKDIR")"
storage_root="$(realpath -m "$ACADEMIC_STORAGE_ROOT")"
backup_dir="$(realpath -m "$(dirname "$IDENTITY_DB_DUMP")")"

if [[ "$RESTORE_CONFIRM" != "I_UNDERSTAND_DISPOSABLE_RESTORE" ]]; then
  echo "Restore refused: explicit disposable-restore confirmation is required." >&2
  exit 1
fi
if [[ ! "$RESTORE_TARGET_LABEL" =~ (disposable|staging) ]]; then
  echo "Restore refused: target label must identify a disposable or staging target." >&2
  exit 1
fi
case "$RESTORE_WORKDIR" in
  /*) ;;
  *) echo "Restore refused: RESTORE_WORKDIR must be an absolute path." >&2; exit 1 ;;
esac
case "$storage_root" in
  "$restore_workdir"/*) ;;
  *) echo "Restore refused: storage root must be below RESTORE_WORKDIR." >&2; exit 1 ;;
esac

for artifact in "$IDENTITY_DB_DUMP" "$ACADEMIC_DB_DUMP" "$ACADEMIC_FILES_ARCHIVE"; do
  artifact_dir="$(realpath -m "$(dirname "$artifact")")"
  if [[ "$artifact_dir" != "$backup_dir" ]]; then
    echo "Restore refused: all artifacts must come from one dated backup directory." >&2
    exit 1
  fi
done

if [[ ! -f "$backup_dir/SHA256SUMS" ]]; then
  echo "Restore refused: SHA256SUMS is required beside the dated backup artifacts." >&2
  exit 1
fi
(
  cd "$backup_dir"
  sha256sum --check --strict SHA256SUMS
)

if [[ -n "${BACKUP_SECRET_SENTINEL:-}" ]]; then
  if grep -R -I -F -q -- "$BACKUP_SECRET_SENTINEL" "$backup_dir"; then
    echo "Restore refused: a configured disposable secret sentinel appears in backup contents." >&2
    exit 1
  fi
fi

if [[ -n "${RESTORE_TENANT_ID:-}" && ! "$RESTORE_TENANT_ID" =~ ^[0-9a-fA-F-]{36}$ ]]; then
  echo "Restore refused: RESTORE_TENANT_ID must be a UUID." >&2
  exit 1
fi

mkdir -p "$restore_workdir" "$storage_root"
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$IDENTITY_DATABASE_URL" "$IDENTITY_DB_DUMP"
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$ACADEMIC_DATABASE_URL" "$ACADEMIC_DB_DUMP"

find "$storage_root" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
tar --extract --gzip --file="$ACADEMIC_FILES_ARCHIVE" --directory="$storage_root"

if [[ "${RESTORE_SKIP_HEALTH_CHECK:-0}" == "1" ]]; then
  echo "Restore note: application health checks were explicitly skipped; this is structural/file verification only." >&2
else
  curl --fail --silent --show-error "$IDENTITY_HEALTH_URL" >/dev/null
  curl --fail --silent --show-error "$ACADEMIC_READY_URL" >/dev/null
fi

if [[ -n "${RESTORE_TENANT_ID:-}" ]]; then
  identity_tenant="$(psql "$IDENTITY_DATABASE_URL" -Atqc "SELECT count(*) FROM tenant_realms WHERE id = '$RESTORE_TENANT_ID'::uuid")"
  academic_tenant="$(psql "$ACADEMIC_DATABASE_URL" -Atqc "SELECT count(*) FROM tenants WHERE id = '$RESTORE_TENANT_ID'")"
  academic_students="$(psql "$ACADEMIC_DATABASE_URL" -Atqc "SELECT count(*) FROM students WHERE tenant_id = '$RESTORE_TENANT_ID'")"
  academic_submissions="$(psql "$ACADEMIC_DATABASE_URL" -Atqc "SELECT count(*) FROM submissions WHERE tenant_id = '$RESTORE_TENANT_ID'")"
  academic_files="$(psql "$ACADEMIC_DATABASE_URL" -Atqc "SELECT count(*) FROM file_objects WHERE tenant_id = '$RESTORE_TENANT_ID'")"
  [[ "$identity_tenant" == "1" && "$academic_tenant" == "1" ]] || {
    echo "Restore verification failed: canonical tenant is not present in both databases." >&2
    exit 1
  }
  printf 'Representative restored counts: students=%s submissions=%s files=%s\n' "$academic_students" "$academic_submissions" "$academic_files"

  if [[ "${RESTORE_VERIFY_FILES:-0}" == "1" ]]; then
    while IFS=$'\t' read -r storage_key expected_sha expected_size; do
      [[ -n "$storage_key" ]] || continue
      if [[ "$storage_key" = /* || "$storage_key" == *..* || "$storage_key" == *$'\n'* ]]; then
        echo "Restore verification failed: unsafe storage key in restored metadata." >&2
        exit 1
      fi
      restored_path="$storage_root/$storage_key"
      [[ -f "$restored_path" ]] || {
        echo "Restore verification failed: restored blob is missing from private storage." >&2
        exit 1
      }
      actual_size="$(stat -c '%s' "$restored_path")"
      [[ "$actual_size" == "$expected_size" ]] || {
        echo "Restore verification failed: restored blob size does not match metadata." >&2
        exit 1
      }
      actual_sha="$(sha256sum "$restored_path" | awk '{print $1}')"
      [[ "$actual_sha" == "$expected_sha" ]] || {
        echo "Restore verification failed: restored blob checksum does not match metadata." >&2
        exit 1
      }
    done < <(psql "$ACADEMIC_DATABASE_URL" -AtF $'\t' -c "SELECT storage_key, sha256, stored_size_bytes FROM stored_blobs WHERE tenant_id = '$RESTORE_TENANT_ID' AND lifecycle = 'AVAILABLE' ORDER BY storage_key")
  fi
fi

printf 'Disposable restore verification passed.\n'
