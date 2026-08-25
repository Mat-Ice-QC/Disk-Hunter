#!/bin/sh
# Kiosk container entrypoint: switch the host console to tty2 and start an
# X server on virtual terminal 2 that runs the kiosk session.

set -e

# KIOSK_URL is provided via environment (see .env / docker-compose.yml).
# Defaults to the Disk-Hunter UI served by the nginx container on localhost:80.
: "${KIOSK_URL:=http://localhost}"

# Switch the physical console to tty2 so the browser is visible there.
# (chvt requires CAP_SYS_TTY_CONFIG / privileged mode; failure is non-fatal
#  so the container still starts if the host has no VT, e.g. serial console.)
if [ -e /dev/tty2 ]; then
    chvt 2 || true
fi

# Launch X on vt2. "-nolisten tcp" disables the TCP listener (no network
# exposure); ":0" is the display; "vt2" binds the X server to tty2.
exec xinit /usr/local/bin/kiosk-session.sh -- -nolisten tcp :0 vt2
