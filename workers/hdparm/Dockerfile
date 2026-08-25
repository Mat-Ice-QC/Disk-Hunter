ARG ALPINE_IMAGE=alpine:3.20.10@sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc
FROM ${ALPINE_IMAGE}

# APK packages pinned to exact versions to prevent supply chain attacks.
ARG HDPARM_VERSION=9.65-r2
ARG UTIL_LINUX_VERSION=2.40.1-r1
ARG GREP_VERSION=3.11-r0

RUN apk add --no-cache \
      hdparm=${HDPARM_VERSION} \
      util-linux=${UTIL_LINUX_VERSION} \
      grep=${GREP_VERSION}

COPY hdparm-secure-erase.sh /usr/local/bin/hdparm-secure-erase.sh
RUN chmod +x /usr/local/bin/hdparm-secure-erase.sh
ENTRYPOINT ["/usr/local/bin/hdparm-secure-erase.sh"]
