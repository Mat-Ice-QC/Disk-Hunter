#!/bin/sh
set -e
DEVICE=$1
METHOD=$2 # "secure" or "enhanced"
PASSWORD="TempPassword"

if [ -z "$DEVICE" ] || [ -z "$METHOD" ]; then
    echo "Usage: $0 <device> <secure|enhanced>"
    exit 1
fi

echo "Checking frozen state for $DEVICE..."
# Check if frozen
FROZEN_CHECK=$(hdparm -I "$DEVICE" | grep -i "frozen" || true)

if echo "$FROZEN_CHECK" | grep -q "frozen" && ! echo "$FROZEN_CHECK" | grep -q "not frozen"; then
    echo "Drive is frozen! Attempting to unfreeze via ATA sleep/wake power cycle..."
    # Force the drive to sleep (powers down the drive controller)
    hdparm -Y "$DEVICE" || true
    sleep 5
    # Wake it up by reading the first sector
    dd if="$DEVICE" of=/dev/null count=1 status=none || true
    sleep 3
    # Re-check state
    echo "Re-checking frozen state for $DEVICE..."
    FROZEN_CHECK=$(hdparm -I "$DEVICE" | grep -i "frozen" || true)
fi

if echo "$FROZEN_CHECK" | grep -q "not frozen"; then
    echo "Drive is not frozen. Proceeding."
elif echo "$FROZEN_CHECK" | grep -q "frozen"; then
    echo "ERROR: Drive is still frozen after auto ATA sleep cycle! Please physically power cycle the drive or suspend the host to unfreeze."
    exit 1
else
    echo "Could not verify frozen state, attempting to proceed..."
fi

echo "Setting security password..."
hdparm --user-master u --security-set-pass "$PASSWORD" "$DEVICE"

if [ "$METHOD" = "enhanced" ]; then
    echo "Executing ATA Enhanced Secure Erase..."
    hdparm --user-master u --security-erase-enhanced "$PASSWORD" "$DEVICE"
else
    echo "Executing ATA Standard Secure Erase..."
    hdparm --user-master u --security-erase "$PASSWORD" "$DEVICE"
fi

echo "ATA Secure Erase completed successfully!"
