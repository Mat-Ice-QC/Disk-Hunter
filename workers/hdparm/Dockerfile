FROM alpine:latest
RUN apk add --no-cache hdparm util-linux grep
COPY hdparm-secure-erase.sh /usr/local/bin/hdparm-secure-erase.sh
RUN chmod +x /usr/local/bin/hdparm-secure-erase.sh
ENTRYPOINT ["/usr/local/bin/hdparm-secure-erase.sh"]
