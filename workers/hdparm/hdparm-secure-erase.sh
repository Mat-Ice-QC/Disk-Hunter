#!/bin/sh
# Wrapper script for ATA Secure Erase via hdparm.
# Outputs progress to stdout so docker logs captures meaningful lines
# while the container is still running.

set -e

DEVICE=$1
METHOD=$2  # "secure" or "enhanced"
# Throwaway ATA security token: random per run, capped at hdparm's 32-byte
# limit. The drive clears it after a successful erase; the EXIT trap disables
# it on failure so the device is never left locked with a known fixed token.
PASSWORD=$(head -c 64 /dev/urandom | tr -dc 'A-Za-z0-9' | head -c 32)
[ -z "$PASSWORD" ] && PASSWORD="TempPassword"

if [ -z "$DEVICE" ] || [ -z "$METHOD" ]; then
    echo "Usage: $0 <device> <secure|enhanced>"
    exit 1
fi

if [ "$METHOD" != "secure" ] && [ "$METHOD" != "enhanced" ]; then
    echo "ERROR: Unknown method '$METHOD'. Expected 'secure' or 'enhanced'."
    exit 1
fi

echo "=== ATA Secure Erase ==="
echo "Target: $DEVICE"
echo "Mode: $METHOD"
echo ""

# --- Capability check -------------------------------------------------------
echo "Querying ATA Security capabilities..."
SEC_INFO=$(hdparm -I "$DEVICE" 2>/dev/null | grep -A30 -i "^[[:space:]]*Security:" || true)

if ! echo "$SEC_INFO" | grep -qi "supported"; then
    echo "ERROR: $DEVICE does not advertise ATA Security / Secure Erase support."
    echo "=== Erase Failed ==="
    exit 1
fi

# A locked drive cannot be erased without the existing security password.
if echo "$SEC_INFO" | grep -qi "locked" && ! echo "$SEC_INFO" | grep -qi "not locked"; then
    echo "ERROR: $DEVICE is security-locked. The existing ATA security password is required to proceed."
    echo "=== Erase Failed ==="
    exit 1
fi

# If enhanced erase was requested but the drive only supports standard, fall back.
if [ "$METHOD" = "enhanced" ]; then
    if ! echo "$SEC_INFO" | grep -qi "enhanced erase"; then
        echo "WARNING: $DEVICE does not support Enhanced Secure Erase. Falling back to Standard Secure Erase..."
        METHOD="secure"
    fi
fi
echo "Capability check passed."
echo ""

# --- Cleanup trap -----------------------------------------------------------
# If the script fails after setting the security password, disable it so the
# drive is not left password-locked for the next user / tool.
PASSWORD_SET=0
cleanup() {
    rc=$1
    if [ "$PASSWORD_SET" = "1" ] && [ "$rc" != "0" ]; then
        echo "Cleanup: disabling ATA security password to avoid leaving $DEVICE locked..."
        hdparm --user-master u --security-disable "$PASSWORD" "$DEVICE" 2>/dev/null || true
    fi
}
trap 'cleanup $?' EXIT

# --- Frozen-state check & unfreeze -----------------------------------------
# The BIOS freezes drives at boot; a frozen drive rejects all ATA security
# commands. Try several software-only unfreeze methods before giving up.

DEV_NAME="${DEVICE#/dev/}"

get_scsi_host() {
    real=$(readlink -f "/sys/block/$1/device" 2>/dev/null || true)
    echo "$real" | grep -oE "host[0-9]+" | head -n1
}

check_frozen() {
    out=$(hdparm -I "$DEVICE" 2>/dev/null | grep -i "frozen" || true)
    if echo "$out" | grep -qi "not frozen"; then
        echo "not_frozen"
    elif echo "$out" | grep -qi "frozen"; then
        echo "frozen"
    else
        echo "unknown"
    fi
}

unfreeze_ata_sleep() {
    echo "  [unfreeze] ATA sleep/wake cycle ($1/2)..."
    hdparm -Y "$DEVICE" 2>/dev/null || true
    sleep 5
    dd if="$DEVICE" of=/dev/null count=1 2>/dev/null || true
    sleep 3
}

unfreeze_link_power() {
    host=$(get_scsi_host "$DEV_NAME")
    if [ -n "$host" ]; then
        pol="/sys/class/scsi_host/$host/link_power_management_policy"
        if [ -w "$pol" ]; then
            echo "  [unfreeze] SATA link power cycle (host: $host)..."
            echo "min_power" > "$pol" 2>/dev/null || true
            sleep 3
            echo "max_performance" > "$pol" 2>/dev/null || true
            sleep 2
        fi
    fi
}

unfreeze_device_state() {
    st="/sys/block/$DEV_NAME/device/state"
    if [ -w "$st" ]; then
        echo "  [unfreeze] device state toggle (offline -> running)..."
        echo "offline" > "$st" 2>/dev/null || true
        sleep 3
        echo "running" > "$st" 2>/dev/null || true
        sleep 2
    fi
}

echo "Checking frozen state for $DEVICE..."
STATE=$(check_frozen)

if [ "$STATE" = "frozen" ]; then
    echo "Drive is frozen. Attempting to unfreeze via multiple methods..."
    unfreeze_ata_sleep 1
    STATE=$(check_frozen)
    if [ "$STATE" = "frozen" ]; then
        unfreeze_link_power
        unfreeze_device_state
        STATE=$(check_frozen)
    fi
    if [ "$STATE" = "frozen" ]; then
        unfreeze_ata_sleep 2
        unfreeze_link_power
        STATE=$(check_frozen)
    fi
    echo "Re-checking frozen state for $DEVICE..."
fi

if [ "$STATE" = "not_frozen" ]; then
    echo "Drive is not frozen. Proceeding with ATA Secure Erase."
elif [ "$STATE" = "frozen" ]; then
    # Can't ATA-secure-erase a frozen drive without a physical power cycle.
    # Fall back to a block-level zero overwrite (NIST SP 800-88 Clear).
    FB="${FROZEN_FALLBACK_WIPE:-1}"
    if [ "$FB" = "1" ] || [ "$FB" = "true" ]; then
        echo "WARNING: $DEVICE is still frozen after all auto unfreeze attempts."
        echo "FROZEN_FALLBACK_WIPE is enabled: falling back to a block-level"
        echo "zero overwrite (software wipe). This is NOT an ATA Secure Erase;"
        echo "it is a single-pass NIST SP 800-88 Clear overwrite of the device."
        echo "To use true ATA Secure Erase, physically power-cycle the drive or"
        echo "suspend/resume the host to unfreeze, then retry."
        echo ""
        SIZE_BYTES=$(blockdev --getsize64 "$DEVICE" 2>/dev/null || echo 0)
        if [ "${SIZE_BYTES:-0}" -gt 0 ] 2>/dev/null; then
            COUNT=$((SIZE_BYTES / 1048576))
            REM=$((SIZE_BYTES % 1048576))
            echo "Performing zero overwrite of $DEVICE ($SIZE_BYTES bytes, $COUNT MiB)..."
            dd if=/dev/zero of="$DEVICE" bs=1048576 count="$COUNT" && FILL_RC=0 || FILL_RC=$?
            # mop up the sub-MiB tail so the very end of the device is covered
            if [ "$REM" -gt 0 ] 2>/dev/null; then
                dd if=/dev/zero of="$DEVICE" bs=1 count="$REM" seek=$((COUNT * 1048576)) 2>/dev/null || true
            fi
            sync
        else
            echo "Could not determine device size; performing open-ended zero overwrite..."
            dd if=/dev/zero of="$DEVICE" bs=1048576 && FILL_RC=0 || FILL_RC=$?
            sync
        fi
        echo ""
        if [ "${FILL_RC:-0}" -eq 0 ]; then
            echo "Frozen-fallback zero overwrite completed successfully."
            echo "=== Erase Complete (fallback overwrite) ==="
            exit 0
        else
            echo "ERROR: frozen-fallback zero overwrite failed with exit code $FILL_RC"
            echo "=== Erase Failed ==="
            exit 1
        fi
    else
        echo "ERROR: Drive is still frozen after auto unfreeze attempts. ATA"
        echo "Secure Erase cannot proceed. Physically power-cycle the drive or"
        echo "suspend the host to unfreeze. (Set FROZEN_FALLBACK_WIPE=1 to"
        echo "enable an automatic block-level overwrite fallback.)"
        echo "=== Erase Failed ==="
        exit 1
    fi
else
    echo "Could not verify frozen state; attempting to proceed..."
fi
echo ""

# --- Set security password --------------------------------------------------
echo "Setting ATA security password..."
if ! hdparm --user-master u --security-set-pass "$PASSWORD" "$DEVICE"; then
    echo "ERROR: Failed to set ATA security password on $DEVICE (security may already be enabled with an unknown password)."
    echo "=== Erase Failed ==="
    exit 1
fi
PASSWORD_SET=1
echo ""

# --- Execute erase ----------------------------------------------------------
# Use the `cmd && a || b` idiom so set -e does not abort before we can report
# the failure code and let the EXIT trap run cleanup.
if [ "$METHOD" = "enhanced" ]; then
    echo "Executing ATA Enhanced Secure Erase..."
    hdparm --user-master u --security-erase-enhanced "$PASSWORD" "$DEVICE" && ERASE_RC=0 || ERASE_RC=$?
else
    echo "Executing ATA Standard Secure Erase..."
    hdparm --user-master u --security-erase "$PASSWORD" "$DEVICE" && ERASE_RC=0 || ERASE_RC=$?
fi

if [ "$ERASE_RC" -eq 0 ]; then
    echo "ATA Secure Erase completed successfully."
    echo "=== Erase Complete ==="
    exit 0
else
    echo "ERROR: hdparm secure erase failed with exit code $ERASE_RC"
    echo "=== Erase Failed ==="
    exit 1
fi
