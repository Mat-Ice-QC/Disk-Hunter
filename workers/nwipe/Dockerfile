ARG DEBIAN_IMAGE=debian:bookworm-slim@sha256:abd67ffcfa541b485a3dff59865ab629aa048a6c613e639d36e7456b0b229241
FROM ${DEBIAN_IMAGE}

RUN apt-get update && apt-get install -y nwipe && rm -rf /var/lib/apt/lists/*

# Set nwipe as the default executable
ENTRYPOINT ["nwipe"]