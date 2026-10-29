ARG PYTHON_IMAGE=python:3.10@sha256:7592f66a25f37c4e88ac9d1eee26b0fd7b6d5d56ace531ffa6aaf3a5317cde27
FROM ${PYTHON_IMAGE}

WORKDIR /app

# Install prerequisites for adding external apt repositories
RUN apt-get update && apt-get install -y ca-certificates curl gnupg util-linux udev && rm -rf /var/lib/apt/lists/*

# Add Docker's official GPG key and dynamically add the correct repo for this Debian version
RUN install -m 0755 -d /etc/apt/keyrings && \
    curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg && \
    chmod a+r /etc/apt/keyrings/docker.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

RUN apt-get update && apt-get install -y --no-install-recommends docker-ce-cli parted e2fsprogs dosfstools ntfs-3g iproute2 isc-dhcp-client ntpsec-ntpdate util-linux util-linux-extra && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Normalize line endings (sed removes CR), then mark executable. Mirrors the
# pattern used in workers/*/Dockerfile so POSIX sh runs cleanly on Linux.
RUN sed -i 's/\r$//' /app/docker-entrypoint.sh \
    && chmod +x /app/docker-entrypoint.sh

ENTRYPOINT ["/app/docker-entrypoint.sh"]

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]