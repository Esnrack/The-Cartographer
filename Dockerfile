FROM nginx:1.27-alpine
COPY server/nginx.conf /etc/nginx/conf.d/default.conf
COPY server/security-headers.conf /etc/nginx/security-headers.conf
COPY public/ /usr/share/nginx/html/
EXPOSE 80
