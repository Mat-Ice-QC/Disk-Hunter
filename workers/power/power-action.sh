#!/bin/sh
# Disk Hunter power worker: powers off or reboots the HOST machine.
# Started ad hoc by the API (POST /api/system/power) with --privileged and
# --pid=host, so PID 1 seen from here is the host's init (normally systemd).
#
# Strategy (first that succeeds wins):
#   1. Graceful: ask the host's systemd, through its mount namespace, to run
#      a clean poweroff/reboot that stops containers and unmounts filesystems.
#   2. Fallback: the host's own poweroff/reboot binary with --force (works
#      without systemd cooperation).
#   3. Last resort: this container's poweroff/reboot -f. With --pid=host and
#      --privileged, the reboot(2) syscall acts on the whole host kernel.
#
# The initial sleep gives the API time to deliver its HTTP response and the
# WebSocket notice to every connected client before the host goes down.
set -x

ACTION="${1:-}"
case "$ACTION" in
    shutdown) SYSTEMD_CMD="poweroff" ;;
    reboot)   SYSTEMD_CMD="reboot" ;;
    *) echo "Usage: power-action.sh shutdown|reboot" >&2; exit 2 ;;
esac

sleep 2

if nsenter -t 1 -m -u -i -n systemctl "$SYSTEMD_CMD" -i; then
    echo "Host systemd accepted the $SYSTEMD_CMD request."
    exit 0
fi

echo "systemctl $SYSTEMD_CMD failed; trying the host binary with --force" >&2
if nsenter -t 1 -m -u -i -n "$SYSTEMD_CMD" --force; then
    exit 0
fi

echo "Host $SYSTEMD_CMD failed; last resort: kernel $SYSTEMD_CMD from this container" >&2
exec "$SYSTEMD_CMD" -f
