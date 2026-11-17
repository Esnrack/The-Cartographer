FROM nginx:1.27-alpine
# nginx config lives in /etc/nginx/cartographer (docker-compose mounts ./server there for live updates)
COPY server/ /etc/nginx/cartographer/
RUN echo 'include /etc/nginx/cartographer/nginx.conf;' > /etc/nginx/conf.d/default.conf
COPY public/ /usr/share/nginx/html/
EXPOSE 80
