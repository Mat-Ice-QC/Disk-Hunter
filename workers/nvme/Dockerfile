ARG ALPINE_IMAGE=alpine:3.20.10@sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc
FROM ${ALPINE_IMAGE}

ARG NVME_CLI_VERSION=2.9.1-r0
RUN apk add --no-cache nvme-cli=${NVME_CLI_VERSION}

COPY run_wipe.sh /run_wipe.sh
RUN chmod +x /run_wipe.sh
ENTRYPOINT ["/run_wipe.sh"]
