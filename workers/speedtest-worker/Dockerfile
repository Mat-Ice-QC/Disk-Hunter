ARG ALPINE_IMAGE=alpine:3.20.10@sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc
FROM ${ALPINE_IMAGE}

ARG FIO_VERSION=3.36-r0
ARG SED_VERSION=4.9-r2
ARG JQ_VERSION=1.7.1-r0

RUN apk --no-cache add fio=${FIO_VERSION} sed=${SED_VERSION} jq=${JQ_VERSION}

COPY run_test.sh /usr/local/bin/run_test.sh
RUN sed -i 's/\r$//' /usr/local/bin/run_test.sh && chmod +x /usr/local/bin/run_test.sh

ENTRYPOINT ["/usr/local/bin/run_test.sh"]
