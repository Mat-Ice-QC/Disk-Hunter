#!/bin/sh
# Disk Hunter backend entrypoint.
# Prepares /app/data bind mount (directories, JSON files, modes, ownership)
# before exec'ing the CMD. Never fails container start on chmod/chown errors.
set -eu

DATA_DIR="/app/data"

warn() {
    printf 'disk-hunter entrypoint: %s\n' "$1" >&2
}

# safe_chmod MODE PATH...
# chmod that never aborts the script on failure.
safe_chmod() {
    _mode="$1"
    shift
    for _p in "$@"; do
        if [ -e "$_p" ]; then
            if ! chmod "$_mode" "$_p" 2>/dev/null; then
                warn "chmod $_mode failed on $_p; continuing"
            fi
        fi
    done
}

# ensure_dir PATH
# mkdir -p, then chmod 755. Never aborts on permission errors.
ensure_dir() {
    _d="$1"
    if [ ! -d "$_d" ]; then
        mkdir -p "$_d" 2>/dev/null || warn "mkdir -p failed for $_d; continuing"
    fi
    safe_chmod 755 "$_d"
}

# ensure_json_file PATH INIT
# If PATH exists as a directory (Docker bind-mount stub) remove the empty
# directory and create the file with INIT content. chmod 644.
ensure_json_file() {
    _f="$1"
    _init="$2"
    if [ -d "$_f" ]; then
        # Only remove if empty; never abort if it isn't.
        if ! rmdir "$_f" 2>/dev/null; then
            warn "$_f is a non-empty directory; leaving in place"
            return 0
        fi
    fi
    if [ ! -f "$_f" ]; then
        # Use a temp file in the same dir so creation modes are predictable.
        _tmp="${_f}.disk-hunter-tmp"
        if printf '%s' "$_init" > "$_tmp" 2>/dev/null && mv -f "$_tmp" "$_f" 2>/dev/null; then
            :
        else
            warn "failed to create $_f; continuing"
            rm -f "$_tmp" 2>/dev/null || true
            return 0
        fi
    fi
    safe_chmod 644 "$_f"
}

# Top-level data dir (must exist for everything else).
ensure_dir "$DATA_DIR"

# Subdirectories.
ensure_dir "$DATA_DIR/isos"
ensure_dir "$DATA_DIR/reports"
ensure_dir "$DATA_DIR/shredding/logs/container_logs"
ensure_dir "$DATA_DIR/smartctl/logs/container_logs"
ensure_dir "$DATA_DIR/smartctl/logs/python"
ensure_dir "$DATA_DIR/speedtest/logs/container_logs"
ensure_dir "$DATA_DIR/speedtest/logs/python"
ensure_dir "$DATA_DIR/images/drives"

# JSON history/settings files.
ensure_json_file "$DATA_DIR/wipe_history.json"        '[]'
ensure_json_file "$DATA_DIR/smartctl_history.json"  '[]'
ensure_json_file "$DATA_DIR/speedtest_history.json" '[]'
ensure_json_file "$DATA_DIR/partition_history.json" '[]'
ensure_json_file "$DATA_DIR/iso_history.json"      '[]'
ensure_json_file "$DATA_DIR/branding.json"         '{}'
ensure_json_file "$DATA_DIR/app_settings.json"     '{}'

# Optional ownership fix-up. Only chown when both IDs are numeric; otherwise
# leave ownership alone (e.g. when running on macOS or when DATA_UID/GID
# are not set).
if [ -n "${DATA_UID:-}" ] && [ -n "${DATA_GID:-}" ]; then
    case "$DATA_UID" in
        ''|*[!0-9]*) _uid_ok=0 ;;
        *) _uid_ok=1 ;;
    esac
    case "$DATA_GID" in
        ''|*[!0-9]*) _gid_ok=0 ;;
        *) _gid_ok=1 ;;
    esac
    if [ "$_uid_ok" = 1 ] && [ "$_gid_ok" = 1 ]; then
        if ! chown -R "$DATA_UID:$DATA_GID" "$DATA_DIR" 2>/dev/null; then
            warn "chown $DATA_UID:$DATA_GID failed on $DATA_DIR; continuing"
        fi
    else
        warn "DATA_UID/DATA_GID must be numeric; skipping chown"
    fi
fi

# Strip group/world write across the data tree; never fail.
if ! chmod -R go-w "$DATA_DIR" 2>/dev/null; then
    warn "chmod -R go-w failed on $DATA_DIR; continuing"
fi

exec "$@"