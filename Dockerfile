# Single deployable image for Cloud Run: React build + Express API + baked-in catalog.
# Build from the repo root:  docker build -t swaradb .
FROM node:22-alpine AS client
WORKDIR /c
COPY client/package.json ./
RUN npm install
COPY client/ ./
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production CATALOG=/app/catalog.json PUBLIC_DIR=/app/public PORT=8080
WORKDIR /app
COPY server/package.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY server/index.js ./
COPY assets/catalog.json ./catalog.json
COPY --from=client /c/dist ./public
USER node
EXPOSE 8080
CMD ["node", "index.js"]
