FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache curl

COPY package.json package-lock.json ./
RUN npm ci --only=production

COPY . .

RUN mkdir -p uploads/resumes

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:5000/api/health || curl -f http://localhost:5000/ || exit 1

CMD ["node", "--import", "./instrument.mjs", "server.js"]
