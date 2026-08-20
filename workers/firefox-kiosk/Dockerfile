# Firefox kiosk container for Disk-Hunter.
#
# Purpose: launch a self-contained X server on the host's virtual terminal 2
# (tty2) and run Firefox ESR in kiosk mode pointing at the Disk-Hunter web UI.
# Intended for air-gapped deployments where no desktop environment is installed
# on the host and a physical operator needs a local browser to drive Disk
# Hunter directly from the console.
#
# Base image is pinned to a specific Debian 12.5 slim tag (released 2024-04-29,
# well over the 7-day minimum). APT packages are pulled from the Debian
# "bookworm" stable channel; exact per-package version pinning is tracked by
# the open "Pin Package Versions" TODO in the project README and can be added
# here once a frozen snapshot is chosen for the air-gapped build host.
FROM debian:12.5-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
        xserver-xorg-core \
        xserver-xorg-video-all \
        xserver-xorg-input-all \
        xserver-xorg-input-libinput \
        xserver-xorg-input-evdev \
        libinput-tools \
        x11-xserver-utils \
        xinit \
        openbox \
        firefox-esr \
        fonts-dejavu-core \
        xdotool \
        kbd \
    && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh      /usr/local/bin/entrypoint.sh
COPY kiosk-session.sh   /usr/local/bin/kiosk-session.sh
RUN sed -i 's/\r$//' /usr/local/bin/entrypoint.sh /usr/local/bin/kiosk-session.sh \
    && chmod +x /usr/local/bin/entrypoint.sh /usr/local/bin/kiosk-session.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
