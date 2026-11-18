# Hosted QA demo (Render free tier): API + worker + Redis + Mailpit behind Caddy (shared login), one container.
# Dev auth and dev simulators are ON. Demo fixtures only, never real data. Not the production image (apps/api/Dockerfile).
FROM node:20-alpine AS build
WORKDIR /repo
COPY package*.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
RUN npm ci --workspaces --include-workspace-root --ignore-scripts
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN npm run build -w @bimaplacement/contracts && npm run build -w @bimaplacement/api

FROM axllent/mailpit:v1.21.8 AS mailpit
FROM caddy:2.8.4-alpine AS caddy

FROM node:20-alpine
RUN apk add --no-cache redis
COPY --from=mailpit /mailpit /usr/local/bin/mailpit
COPY --from=caddy /usr/bin/caddy /tmp/caddy
# the official binary carries file capabilities (cap_net_bind_service); Render refuses to exec those
# ("Operation not permitted"). A plain copy drops them; Caddy listens on a high port anyway.
RUN cp /tmp/caddy /usr/local/bin/caddy && rm /tmp/caddy
# development keeps the production boot checks off (dev auth + simulators are the point of this demo)
ENV NODE_ENV=development TZ=Asia/Kolkata LOG_LEVEL=info
WORKDIR /app
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/contracts ./node_modules/@bimaplacement/contracts
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/package.json ./
COPY --chmod=755 infra/demo/Caddyfile infra/demo/start.sh ./
# only uploads and Mailpit's data need to be writable by node
RUN mkdir -p uploads && chown node:node /app /app/uploads
USER node
EXPOSE 10000
CMD ["./start.sh"]
