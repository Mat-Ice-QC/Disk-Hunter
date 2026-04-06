FROM debian:bookworm-slim

# Install nwipe and clean up the cache to keep the image tiny
RUN apt-get update && apt-get install -y nwipe && rm -rf /var/lib/apt/lists/*

# Set nwipe as the default executable
ENTRYPOINT ["nwipe"]