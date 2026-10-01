FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY . .
RUN npm ci && npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATABASE_PATH=/app/data/paloalto.sqlite
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/backend/package.json ./backend/package.json
COPY --from=build /app/participant-app/package.json ./participant-app/package.json
COPY --from=build /app/onlyoffice-plugin/package.json ./onlyoffice-plugin/package.json
COPY --from=build /app/shared/package.json ./shared/package.json
RUN npm ci --omit=dev && mkdir -p /app/data && chown node:node /app/data
COPY --from=build /app/dist ./dist
COPY --from=build /app/backend/migrations ./backend/migrations
COPY --from=build /app/shared/scenes.json ./shared/scenes.json
COPY --from=build /app/LICENSE ./LICENSE
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/backend/index.js"]
