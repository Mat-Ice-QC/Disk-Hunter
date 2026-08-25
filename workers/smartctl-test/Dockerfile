ARG ALPINE_IMAGE=alpine:3.20.10@sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc
FROM ${ALPINE_IMAGE}

ARG SMARTMONTOOLS_VERSION=7.4-r1
ARG SED_VERSION=4.9-r2

RUN apk --no-cache add smartmontools=${SMARTMONTOOLS_VERSION} sed=${SED_VERSION}

COPY run_test.sh /usr/local/bin/run_test.sh
RUN sed -i 's/\r$//' /usr/local/bin/run_test.sh && chmod +x /usr/local/bin/run_test.sh

ENTRYPOINT ["/usr/local/bin/run_test.sh"]
