FROM alpine:latest

RUN apk --no-cache add smartmontools sed

COPY run_test.sh /usr/local/bin/run_test.sh
RUN sed -i 's/$//' /usr/local/bin/run_test.sh && chmod +x /usr/local/bin/run_test.sh

ENTRYPOINT ["/usr/local/bin/run_test.sh"]
