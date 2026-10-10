# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install --global pnpm@11.23.0
RUN pnpm install --frozen-lockfile
COPY . .
ARG BUILD_TIME
ENV BUILD_TIME=$BUILD_TIME
RUN pnpm run typecheck
RUN pnpm run deploy

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=8080 DATA_DIR=/app/data
COPY --from=build --chown=node:node /app/.output ./.output
COPY --from=build --chown=node:node /app/assets ./assets
COPY --from=build --chown=node:node /app/public/stamps ./public/stamps
COPY --from=build --chown=node:node /app/scripts ./scripts
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 8080
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "const r=await fetch('http://127.0.0.1:8080/api/health');process.exit(r.ok?0:1)"
CMD ["node", ".output/index.js"]
