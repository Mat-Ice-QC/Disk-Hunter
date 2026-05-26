FROM alpine:latest

RUN apk --no-cache add fio sed jq

COPY run_test.sh /usr/local/bin/run_test.sh
RUN sed -i 's/\r$//' /usr/local/bin/run_test.sh && chmod +x /usr/local/bin/run_test.sh

ENTRYPOINT ["/usr/local/bin/run_test.sh"]
