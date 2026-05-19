FROM node:20-alpine AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc
RUN npm prune --production

FROM node:20-alpine
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=build /build/dist ./dist
COPY --from=build /build/node_modules ./node_modules
COPY --from=build /build/package.json ./

RUN mkdir -p /data && chown app:app /data

ENV NODE_ENV=production
ENV PORT=3100
ENV DB_PATH=/data/logs.db

EXPOSE 3100
USER app
CMD ["node", "dist/index.js"]
