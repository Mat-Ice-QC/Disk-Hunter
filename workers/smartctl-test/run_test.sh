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

# Record the number of existing self-test log entries so we can detect when
# a new entry appears (i.e. the test completed, possibly very quickly on SSDs).
INITIAL_LOG_COUNT=$(smartctl -l selftest "$DEVICE" 2>&1 | grep -c '^#')

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

# Wait briefly for the drive to register the test before the first check.
sleep 5

# Track whether we've ever seen the test "in progress" — we only accept a
# "completed" status AFTER we've confirmed the test was running.
SEEN_IN_PROGRESS=0
WAIT_RETRIES=0
MAX_WAIT_RETRIES=6  # 6 x 30s = 3 min max waiting for the test to register

while true; do
  # Capture the self-test execution status line AND the following lines,
  # because smartctl splits the description across multiple tab-indented
  # lines (e.g. "% of test remaining" and "without error" are on the
  # NEXT line, not the same line as the status header).
  STATUS_BLOCK=$(smartctl -a "$DEVICE" | grep -A2 "Self-test execution status")

  if echo "$STATUS_BLOCK" | grep -q "in progress"; then
    SEEN_IN_PROGRESS=1
    REMAINING=$(echo "$STATUS_BLOCK" | grep -o '[0-9]\{1,3\}% of test remaining' | head -1 | sed 's/%.*//')
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
  elif echo "$STATUS_BLOCK" | grep -q "aborted"; then
    echo "Test on $DEVICE was aborted by the host."
    break
  elif [ "$SEEN_IN_PROGRESS" -eq 1 ]; then
    # The test was previously in progress and now it's not — it completed.
    if echo "$STATUS_BLOCK" | grep -q "completed"; then
      if echo "$STATUS_BLOCK" | grep -q "without error"; then
          echo "Test on $DEVICE completed successfully."
      elif echo "$STATUS_BLOCK" | grep -q "read error"; then
          echo "Test on $DEVICE completed with read error."
      elif echo "$STATUS_BLOCK" | grep -q "write error"; then
          echo "Test on $DEVICE completed with write error."
      else
          echo "Test on $DEVICE completed (status: $(echo "$STATUS_BLOCK" | head -1))."
      fi
    else
      echo "Test on $DEVICE finished. Status: $(echo "$STATUS_BLOCK" | head -1)"
    fi
    break
  else
    # Haven't seen "in progress" yet. The test may not have registered yet,
    # OR it may have completed very quickly (common for short tests on SSDs).
    # Check the self-test log for a new entry.
    CURRENT_LOG_COUNT=$(smartctl -l selftest "$DEVICE" 2>&1 | grep -c '^#')
    if [ "$CURRENT_LOG_COUNT" -gt "$INITIAL_LOG_COUNT" ]; then
      # A new log entry appeared — the test completed before we saw progress.
      LATEST_ENTRY=$(smartctl -l selftest "$DEVICE" 2>&1 | grep '^#' | head -1)
      if echo "$LATEST_ENTRY" | grep -q "without error"; then
          echo "Test on $DEVICE completed successfully."
      elif echo "$LATEST_ENTRY" | grep -q "read error"; then
          echo "Test on $DEVICE completed with read error."
      elif echo "$LATEST_ENTRY" | grep -q "write error"; then
          echo "Test on $DEVICE completed with write error."
      elif echo "$LATEST_ENTRY" | grep -q "aborted"; then
          echo "Test on $DEVICE was aborted by the host."
      else
          echo "Test on $DEVICE completed. Log entry: $LATEST_ENTRY"
      fi
      break
    fi

    WAIT_RETRIES=$((WAIT_RETRIES + 1))
    if [ "$WAIT_RETRIES" -ge "$MAX_WAIT_RETRIES" ]; then
      echo "Test on $DEVICE did not register after $((MAX_WAIT_RETRIES * 30))s. It may have completed or failed to start. Check the self-test log manually."
      break
    fi
    echo "Waiting for test to register on $DEVICE..."
  fi

  sleep 30 # Check every 30 seconds
done

echo "Monitoring finished for $DEVICE."
