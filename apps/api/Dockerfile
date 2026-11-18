# Single image, three entrypoints: API (default), worker (node dist/worker.js), migrations (npm run db:deploy)
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

FROM node:20-alpine
ENV NODE_ENV=production TZ=Asia/Kolkata
WORKDIR /app
# RDS CA bundle: the API verifies the database TLS certificate (DB_SSL_CA_PATH, rds.force_ssl)
RUN mkdir -p certs && wget -qO certs/rds-global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/contracts ./node_modules/@bimaplacement/contracts
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/package.json ./
USER node
EXPOSE 4000
# Worker: node dist/worker.js. Migrations + PRD master seed (one-off task): npm run db:deploy
CMD ["node", "dist/main.js"]
