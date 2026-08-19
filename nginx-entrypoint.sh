#!/bin/sh
# This script runs before NGINX starts and dynamically generates default.conf

cat <<EOF > /etc/nginx/conf.d/default.conf
server {
    listen 80;
    server_name localhost;
EOF

if [ -n "$HTTPS_CERT_PATH" ] && [ -n "$HTTPS_KEY_PATH" ]; then
cat <<EOF >> /etc/nginx/conf.d/default.conf
    listen 443 ssl;
    ssl_certificate $HTTPS_CERT_PATH;
    ssl_certificate_key $HTTPS_KEY_PATH;
EOF
fi

cat <<EOF >> /etc/nginx/conf.d/default.conf
    root /usr/share/nginx/html;
    index index.html;

    location / {
EOF

if [ -n "$ALLOWED_IPS" ] && [ "$ALLOWED_IPS" != "*" ]; then
    IFS=','
    for ip in $ALLOWED_IPS; do
        # Trim whitespace
        clean_ip=$(echo $ip | xargs)
        if [ -n "$clean_ip" ]; then
            echo "        allow $clean_ip;" >> /etc/nginx/conf.d/default.conf
        fi
    done
    echo "        deny all;" >> /etc/nginx/conf.d/default.conf
fi

cat <<EOF >> /etc/nginx/conf.d/default.conf
        try_files \$uri \$uri/ =404;
    }

    location /api/ {
EOF

if [ -n "$ALLOWED_IPS" ] && [ "$ALLOWED_IPS" != "*" ]; then
    IFS=','
    for ip in $ALLOWED_IPS; do
        clean_ip=$(echo $ip | xargs)
        if [ -n "$clean_ip" ]; then
            echo "        allow $clean_ip;" >> /etc/nginx/conf.d/default.conf
        fi
    done
    echo "        deny all;" >> /etc/nginx/conf.d/default.conf
fi

cat <<EOF >> /etc/nginx/conf.d/default.conf
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    location /ws {
EOF

if [ -n "$ALLOWED_IPS" ] && [ "$ALLOWED_IPS" != "*" ]; then
    IFS=','
    for ip in $ALLOWED_IPS; do
        clean_ip=$(echo $ip | xargs)
        if [ -n "$clean_ip" ]; then
            echo "        allow $clean_ip;" >> /etc/nginx/conf.d/default.conf
        fi
    done
    echo "        deny all;" >> /etc/nginx/conf.d/default.conf
fi

cat <<EOF >> /etc/nginx/conf.d/default.conf
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
EOF
