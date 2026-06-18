FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY services/lyrics-service/package.json services/lyrics-service/
COPY apps/control-ui/package.json apps/control-ui/
COPY apps/audience-ui/package.json apps/audience-ui/
COPY apps/singer-ui/package.json apps/singer-ui/

RUN npm ci --omit=dev

COPY config ./config
COPY services ./services
COPY apps ./apps

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

USER node
CMD ["node", "services/lyrics-service/server.js"]
