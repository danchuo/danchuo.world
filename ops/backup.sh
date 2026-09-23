#!/usr/bin/env bash
# Nightly encrypted Postgres dump plus day photos and artifact files → Google Drive.
# Drop frames are kept by the owner elsewhere. Setup and restore: docs/deploy.md §6.
set -euo pipefail

CONTAINER=danchuoworld-postgres
DB=danchuo
DB_USER=danchuo
REMOTE=gdrive:danchuoworld-backups
PASS_FILE=/root/.danchuoworld-backup-pass
KEEP_DAYS=30
MEDIA_REMOTE=gdrive:danchuoworld-media
FILM_DIR=$(docker volume inspect -f '{{.Mountpoint}}' danchuoworld_filmdata)

STAMP=$(date +%F_%H%M)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB" -Fc > "$TMP/danchuoworld_$STAMP.dump"

gpg --symmetric --cipher-algo AES256 --batch --passphrase-file "$PASS_FILE" \
    -o "$TMP/danchuoworld_$STAMP.dump.gpg" "$TMP/danchuoworld_$STAMP.dump"

rclone copy "$TMP/danchuoworld_$STAMP.dump.gpg" "$REMOTE"
rclone delete "$REMOTE" --min-age "${KEEP_DAYS}d"

# `copy`, not `sync`: a file deleted on the server stays in the backup. Outside $REMOTE, so no rotation.
for dir in days artifacts; do
    [ -d "$FILM_DIR/$dir" ] || continue  # days/ appears with the first day photo
    rclone copy "$FILM_DIR/$dir" "$MEDIA_REMOTE/$dir"
done

echo "$(date -Is) backup ok: danchuoworld_$STAMP.dump.gpg ($(du -h "$TMP/danchuoworld_$STAMP.dump.gpg" | cut -f1))"
