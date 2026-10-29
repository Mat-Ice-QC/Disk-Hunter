#!/bin/sh
# This script runs before NGINX starts and dynamically generates default.conf

cat <<EOF > /etc/nginx/conf.d/default.conf
server {
    listen 80;
    server_name localhost;

    # Compress text assets on the wire. The UI ships uncompressed JS/CSS/JSON
    # (common.js ~54 KB, style.css ~32 KB, locales.json ~12 KB) and the LAN
    # kiosk re-downloads them on every navigation without this.
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 5;
    gzip_min_length 256;
    gzip_types text/css text/plain image/svg+xml application/javascript application/x-javascript application/json text/xml application/xml;
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

    location ~* ^/.*\\.(html|js|mjs|css|json|svg|txt)$ {
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
        # Static text assets revalidate via ETag (304 when unchanged): file
        # sync deploys are always picked up, and nothing is re-downloaded
        # unless it actually changed.
        try_files \$uri =404;
        add_header Cache-Control "no-cache";
    }

    location ^~ /api/ {
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

    location ^~ /ws {
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
