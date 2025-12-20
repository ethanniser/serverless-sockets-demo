FROM nginx:alpine

COPY nginx.conf.template /etc/nginx/nginx.conf.template

# Use envsubst to substitute environment variables at runtime
CMD ["/bin/sh", "-c", "envsubst '${PROXY_TARGET}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf && nginx -g 'daemon off;'"]

