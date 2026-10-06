FROM node:20-bookworm-slim

WORKDIR /app

COPY backend/package.json ./package.json
RUN npm install --omit=dev

COPY backend/ ./

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "src/server.js"]
