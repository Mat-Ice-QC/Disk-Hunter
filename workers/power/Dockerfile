ARG ALPINE_IMAGE=alpine:3.20.10@sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc
FROM ${ALPINE_IMAGE}

# APK packages pinned to exact versions to prevent supply chain attacks.
ARG UTIL_LINUX_VERSION=2.40.1-r1

RUN apk add --no-cache util-linux=${UTIL_LINUX_VERSION}

COPY power-action.sh /usr/local/bin/power-action.sh
RUN chmod +x /usr/local/bin/power-action.sh
ENTRYPOINT ["/usr/local/bin/power-action.sh"]
