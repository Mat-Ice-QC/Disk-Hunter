#!/bin/sh
# Wrapper script for NVMe secure erase via nvme-cli format.
# Outputs progress to stdout so docker logs captures meaningful lines
# while the container is still running.

DEVICE=$1
shift

if [ -z "$DEVICE" ]; then
    echo "Usage: $0 <device> [nvme format options...]"
    exit 1
fi

# Extract the SES value from the remaining args
SES=""
for arg in "$@"; do
    case "$arg" in
        --ses=*) SES="${arg#--ses=}" ;;
    esac
done

echo "=== NVMe Secure Erase ==="
echo "Target: $DEVICE"
if [ "$SES" = "2" ]; then
    echo "Mode: Cryptographic Erase (SES=2)"
elif [ "$SES" = "1" ]; then
    echo "Mode: User Data Erase (SES=1)"
else
    echo "Mode: Format (SES=$SES)"
fi
echo "Options: $*"

# For crypto erase (SES=2), check if the drive supports it first.
if [ "$SES" = "2" ]; then
    CONTROLLER=$(echo "$DEVICE" | sed 's/n[0-9]*$//')
    echo "Checking cryptographic erase support on $CONTROLLER..."
    SANICAP=$(nvme id-ctrl "$CONTROLLER" 2>/dev/null | grep -i "^sanicap" | awk '{print $3}')
    if [ -z "$SANICAP" ] || [ "$SANICAP" = "0" ]; then
        echo "WARNING: This drive does not support cryptographic erase (sanicap=0)."
        echo "Falling back to User Data Erase (SES=1)..."
        # Replace --ses=2 with --ses=1 in the args
        NEW_ARGS=""
        for arg in "$@"; do
            case "$arg" in
                --ses=2) NEW_ARGS="$NEW_ARGS --ses=1" ;;
                *) NEW_ARGS="$NEW_ARGS $arg" ;;
            esac
        done
        echo "Starting nvme format (fallback to user data erase)..."
        nvme format "$DEVICE" $NEW_ARGS
        EXIT_CODE=$?
    else
        echo "Cryptographic erase supported. Starting nvme format..."
        nvme format "$DEVICE" "$@"
        EXIT_CODE=$?
    fi
else
    echo "Starting nvme format..."
    nvme format "$DEVICE" "$@"
    EXIT_CODE=$?
fi

if [ $EXIT_CODE -eq 0 ]; then
    echo "Success formatting $DEVICE"
    echo "=== Erase Complete ==="
else
    echo "Error: nvme format failed with exit code $EXIT_CODE"
    echo "=== Erase Failed ==="
fi

exit $EXIT_CODE
