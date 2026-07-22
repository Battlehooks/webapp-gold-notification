FROM node:24-slim

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src

RUN npm run build
RUN mkdir -p /app/data

EXPOSE 3000
CMD ["node", "dist/index.js"]
