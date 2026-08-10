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

if [[ -n "${RESTORE_TENANT_ID:-}" && ! "$RESTORE_TENANT_ID" =~ ^[0-9a-fA-F-]{36}$ ]]; then
  echo "Restore refused: RESTORE_TENANT_ID must be a UUID." >&2
  exit 1
fi

mkdir -p "$restore_workdir" "$storage_root"
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$IDENTITY_DATABASE_URL" "$IDENTITY_DB_DUMP"
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$ACADEMIC_DATABASE_URL" "$ACADEMIC_DB_DUMP"

find "$storage_root" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
tar --extract --gzip --file="$ACADEMIC_FILES_ARCHIVE" --directory="$storage_root"

curl --fail --silent --show-error "$IDENTITY_HEALTH_URL" >/dev/null
curl --fail --silent --show-error "$ACADEMIC_READY_URL" >/dev/null

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
fi

printf 'Disposable restore verification passed.\n'
