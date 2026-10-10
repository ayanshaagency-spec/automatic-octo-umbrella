FROM node:20-bookworm-slim

WORKDIR /app

COPY backend/package.json ./package.json
RUN npm install --omit=dev

COPY backend/ ./
# The API serves the existing web client from /web; include it in the image.
COPY web/ /web/

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "src/server.js"]
