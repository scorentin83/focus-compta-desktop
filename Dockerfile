FROM nginx:alpine

COPY frontend/public/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf
