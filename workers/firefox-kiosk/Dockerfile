# Firefox kiosk container for Disk-Hunter.
# Launches X on tty2 and runs Firefox ESR in kiosk mode at the Disk-Hunter UI.
# For air-gapped deployments with no desktop environment.
ARG DEBIAN_IMAGE=debian:12.5-slim@sha256:67f3931ad8cb1967beec602d8c0506af1e37e8d73c2a0b38b181ec5d8560d395
FROM ${DEBIAN_IMAGE}

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
