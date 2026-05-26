#!/bin/sh

# Script to run a S.M.A.R.T. test and monitor its progress.

DEVICE=$1
TEST_TYPE=$2

if [ -z "$DEVICE" ] || [ -z "$TEST_TYPE" ]; then
  echo "Usage: $0 <device> <short|long|conveyance|...>"
  exit 1
fi

echo "Starting S.M.A.R.T. test ($TEST_TYPE) on $DEVICE"
echo "Executing: smartctl -t \"$TEST_TYPE\" \"$DEVICE\""

START_OUTPUT=$(smartctl -t "$TEST_TYPE" "$DEVICE" 2>&1)
EXIT_CODE=$?
echo "$START_OUTPUT"

ESTIMATED_MIN=$(echo "$START_OUTPUT" | grep -i "Please wait" | sed -n 's/.*Please wait \([0-9]*\) minutes.*/\1/p')
if [ -n "$ESTIMATED_MIN" ]; then
    echo "Estimated total time: $ESTIMATED_MIN minutes."
fi

# smartctl can return a non-zero exit code even if the test starts successfully.
if [ $EXIT_CODE -ne 0 ]; then
    echo "Warning: smartctl command returned a non-zero exit code. Continuing to monitor..."
fi

echo "Monitoring test progress..."

while true; do
  STATUS_LINE=$(smartctl -a "$DEVICE" | grep "Self-test execution status")

  if echo "$STATUS_LINE" | grep -q "in progress"; then
    REMAINING=$(echo "$STATUS_LINE" | sed -n 's/.* \([0-9]\{1,3\}\)% of test remaining.*/\1/p')
    if [ -n "$REMAINING" ]; then
        PROGRESS=$((100 - REMAINING))
        if [ -n "$ESTIMATED_MIN" ]; then
            REMAINING_MIN=$(( (ESTIMATED_MIN * REMAINING) / 100 ))
            echo "Test in progress on $DEVICE: $PROGRESS% complete. Estimated $REMAINING_MIN minutes remaining."
        else
            echo "Test in progress on $DEVICE: $PROGRESS% complete."
        fi
    else
        echo "Test in progress on $DEVICE, progress percentage not yet available."
    fi
  elif echo "$STATUS_LINE" | grep -q "completed without error"; then
    echo "Test on $DEVICE completed successfully."
    break
  elif echo "$STATUS_LINE" | grep -q "completed with read error"; then
    echo "Test on $DEVICE completed with read error."
    break
  elif echo "$STATUS_LINE" | grep -q "completed with write error"; then
    echo "Test on $DEVICE completed with write error."
    break
  elif echo "$STATUS_LINE" | grep -q "aborted by host"; then
    echo "Test on $DEVICE was aborted by the host."
    break
  else
    echo "Test on $DEVICE finished or is in an unknown state. Status: $STATUS_LINE"
    break
  fi

  sleep 30 # Check every 30 seconds
done

echo "Monitoring finished for $DEVICE."
