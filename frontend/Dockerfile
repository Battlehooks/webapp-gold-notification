FROM node:22-slim AS build
WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

# Vite bakes these in at build time -- they must be browser-reachable URLs
# (the frontend runs in the user's browser, not inside the compose network),
# so these default to localhost, not the other services' compose hostnames.
ARG VITE_MARKET_DATA_URL=http://localhost:8001
ARG VITE_INSIGHT_URL=http://localhost:8002
ARG VITE_NOTIFICATION_URL=http://localhost:3000
ARG VITE_AGENT_URL=http://localhost:8003
ENV VITE_MARKET_DATA_URL=$VITE_MARKET_DATA_URL
ENV VITE_INSIGHT_URL=$VITE_INSIGHT_URL
ENV VITE_NOTIFICATION_URL=$VITE_NOTIFICATION_URL
ENV VITE_AGENT_URL=$VITE_AGENT_URL

RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
