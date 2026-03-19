FROM python:3.10-slim

WORKDIR /app

# Install util-linux for lsblk and udev for hardware queries
RUN apt-get update && apt-get install -y util-linux udev && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]