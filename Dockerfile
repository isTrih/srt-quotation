# syntax=docker/dockerfile:1
FROM --platform=$BUILDPLATFORM oven/bun:1.4.3 AS bun-bin
FROM --platform=$BUILDPLATFORM node:24-bookworm-slim AS build
COPY --from=bun-bin /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
ARG BUILD_TIME
ENV BUILD_TIME=$BUILD_TIME
RUN bun run build
RUN bun -e 'const fs=require("node:fs"); const m=JSON.parse(fs.readFileSync("output/runtime-build.json")); fs.cpSync(m.directory,"/release",{recursive:true,dereference:true})'

FROM oven/bun:1.4.3-slim AS runtime
USER root
RUN groupadd --gid 10001 quotation && useradd --uid 10001 --gid quotation --no-create-home quotation
WORKDIR /app
ENV NODE_ENV=production PORT=8080 DATA_DIR=/app/data
COPY --from=build --chown=10001:10001 /release/ ./
RUN mkdir -p /app/data && chown 10001:10001 /app/data
USER 10001:10001
EXPOSE 8080
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["bun", "-e", "fetch('http://127.0.0.1:'+ (process.env.PORT||8080) +'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["bun", ".output/index.js"]
