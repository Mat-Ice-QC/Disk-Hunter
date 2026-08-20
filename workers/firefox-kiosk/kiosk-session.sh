#!/bin/sh
# X client session run by xinit: disable screen blanking, start a lightweight
# window manager (mouse cursor preserved so the operator can interact with the
# Disk-Hunter UI), then launch Firefox ESR in kiosk mode.

set -e

: "${KIOSK_URL:=http://localhost}"

# Keep the screen on: no screensaver, no blanking, no DPMS power-off.
xset s off        2>/dev/null || true
xset s noblank    2>/dev/null || true
xset -dpms        2>/dev/null || true

# openbox provides focus/stacking management while keeping the cursor visible
# for mouse interaction with the Disk-Hunter dashboard.
openbox &
WM_PID=$!

# Give the window manager a moment to come up before launching the browser.
sleep 1

# --kiosk        : fullscreen, no URL bar, no tabs, no chrome.
# --no-remote    : do not reuse an existing Firefox instance.
exec firefox-esr --kiosk --no-remote "$KIOSK_URL"
