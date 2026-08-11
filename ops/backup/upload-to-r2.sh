#!/usr/bin/env bash
set -euo pipefail

# Upload one completed, checksum-verified backup directory to Cloudflare R2.
# Credentials are read from the runtime environment and are never printed.
# This helper deliberately does not delete the local staging directory; the
# caller may prune it only after this command exits successfully.

: "${BACKUP_SET_DIR:?set the completed dated backup directory}"
: "${BACKUP_R2_ENDPOINT:?set the runtime-managed Cloudflare R2 endpoint}"
: "${BACKUP_R2_BUCKET:?set the runtime-managed Cloudflare R2 bucket}"
: "${BACKUP_R2_PREFIX:?set the runtime-managed R2 key prefix}"
: "${BACKUP_R2_ACCESS_KEY_ID:?set the runtime-managed R2 access key ID}"
: "${BACKUP_R2_SECRET_ACCESS_KEY:?set the runtime-managed R2 secret access key}"

command -v aws >/dev/null 2>&1 || {
  echo "R2 backup refused: AWS CLI is required for the S3-compatible transfer." >&2
  exit 1
}

backup_dir="$(realpath -e "$BACKUP_SET_DIR")"
[[ -d "$backup_dir" ]] || {
  echo "R2 backup refused: backup set is not a directory." >&2
  exit 1
}
[[ "$BACKUP_R2_ENDPOINT" == https://* ]] || {
  echo "R2 backup refused: endpoint must use HTTPS." >&2
  exit 1
}
[[ -n "$BACKUP_R2_BUCKET" && "$BACKUP_R2_BUCKET" != */* ]] || {
  echo "R2 backup refused: bucket must be a single bucket name." >&2
  exit 1
}
case "$BACKUP_R2_PREFIX" in
  ""|/*|*..*|*$'\n'*)
    echo "R2 backup refused: key prefix is empty or unsafe." >&2
    exit 1
    ;;
esac
[[ -f "$backup_dir/SHA256SUMS" ]] || {
  echo "R2 backup refused: SHA256SUMS is missing." >&2
  exit 1
}

if find "$backup_dir" -mindepth 1 -maxdepth 1 ! -type f -print -quit | grep -q .; then
  echo "R2 backup refused: backup set contains a non-file entry." >&2
  exit 1
fi

(
  cd "$backup_dir"
  sha256sum --check --strict SHA256SUMS
)

remote_prefix="${BACKUP_R2_PREFIX%/}/$(basename "$backup_dir")"
export AWS_ACCESS_KEY_ID="$BACKUP_R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$BACKUP_R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-auto}"
export AWS_PAGER=""

aws s3 cp \
  --endpoint-url "$BACKUP_R2_ENDPOINT" \
  --only-show-errors \
  --no-progress \
  --recursive \
  "$backup_dir/" \
  "s3://$BACKUP_R2_BUCKET/$remote_prefix/"

while IFS= read -r -d '' artifact; do
  artifact_name="$(basename "$artifact")"
  local_size="$(stat -c '%s' "$artifact")"
  remote_size="$(aws s3api head-object \
    --endpoint-url "$BACKUP_R2_ENDPOINT" \
    --bucket "$BACKUP_R2_BUCKET" \
    --key "$remote_prefix/$artifact_name" \
    --query ContentLength \
    --output text \
    --no-cli-pager)"
  [[ "$remote_size" == "$local_size" ]] || {
    echo "R2 backup verification failed: remote size differs for $artifact_name." >&2
    exit 1
  }
done < <(find "$backup_dir" -mindepth 1 -maxdepth 1 -type f -print0 | sort -z)

printf 'R2 backup upload and remote verification passed: %s\n' "$(basename "$backup_dir")"
