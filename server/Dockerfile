# Build from the repo root:  docker build -f server/Dockerfile -t swaradb-api .
FROM node:22-alpine
ENV NODE_ENV=production CATALOG=/app/catalog.json PORT=3001
WORKDIR /app
COPY server/package.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY server/index.js ./
COPY assets/catalog.json ./catalog.json
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3001/healthz || exit 1
CMD ["node", "index.js"]
