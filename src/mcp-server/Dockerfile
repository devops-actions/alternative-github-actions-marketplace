FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "index.js"]
