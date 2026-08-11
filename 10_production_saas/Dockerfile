FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
COPY data ./data
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4175 DATA_FILE=/app/data/store.json
EXPOSE 4175
CMD ["node", "src/server.mjs"]
