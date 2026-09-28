FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    MAVEN_DATA_DIR=/data \
    PORT=3000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY tsconfig.json ./
COPY src ./src
COPY public ./public
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["npx", "tsx", "src/server.ts"]
