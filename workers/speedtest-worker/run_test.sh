#!/bin/sh

# Script to run a fio speed test and report progress.

DEVICE=$1
TEST_TYPE=$2
SIZE=$3

if [ -z "$DEVICE" ]; then
  echo "Usage: $0 <device> <read|write|rw> [size]"
  exit 1
fi

TEST_TYPE=${TEST_TYPE:-read}
SIZE=${SIZE:-1G}

echo "Starting Speed Test ($TEST_TYPE, $SIZE) on $DEVICE"

if [ "$TEST_TYPE" = "write" ] || [ "$TEST_TYPE" = "rw" ]; then
    RW_ARG="$TEST_TYPE"
else
    RW_ARG="read"
fi

# Run a benchmark for the specified size, logging ETA to stderr and real output to stdout
FIO_CMD="fio --name=speedtest --filename=$DEVICE --rw=$RW_ARG --bs=1M --size=$SIZE --numjobs=1 --group_reporting --eta=always"

echo "Executing: $FIO_CMD"
# Run fio, and capture the full output to parse at the end. Since we are in Docker, 
# everything sent to stdout and stderr is captured in docker logs.
$FIO_CMD > /tmp/fio.log 2>&1 &
PID=$!

# Tail the file while it's running so we get live updates in docker logs
tail -f /tmp/fio.log &
TAIL_PID=$!

# Get the exit code
wait $PID
EXIT_CODE=$?

kill $TAIL_PID 2>/dev/null || true

if [ $EXIT_CODE -ne 0 ]; then
    echo "Error: fio command failed."
    exit $EXIT_CODE
fi

echo "=== TEST COMPLETE ==="
# Parse read speed
READ_LINE=$(grep "READ: bw=" /tmp/fio.log)
if [ -n "$READ_LINE" ]; then
    # e.g. READ: bw=101MiB/s (106MB/s)
    READ_SPEED=$(echo "$READ_LINE" | sed -n 's/.*bw=\([^ ,]*\).*/\1/p')
    echo "Read Speed: $READ_SPEED"
fi

# Parse write speed
WRITE_LINE=$(grep "WRITE: bw=" /tmp/fio.log)
if [ -n "$WRITE_LINE" ]; then
    WRITE_SPEED=$(echo "$WRITE_LINE" | sed -n 's/.*bw=\([^ ,]*\).*/\1/p')
    echo "Write Speed: $WRITE_SPEED"
fi

echo "Monitoring finished for $DEVICE."
