# syntax=docker/dockerfile:1
#
# Imagem do frontend do Gastoba: build da SPA e nginx sem privilégios servindo os arquivos
# estáticos e repassando /api/ para a API (mesmo site, exigido pelo cookie SameSite=Strict).
# As imagens-base estão fixadas por digest (consultados em 2026-10-12); atualizá-las é manutenção manual.

FROM node:24.21.0-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS construcao
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY index.html tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts ./
COPY public ./public
COPY src ./src
# A SPA chama a API por caminho relativo: o nginx da imagem repassa /api/ para o serviço "api".
ENV VITE_API_URL=/api VITE_USAR_SIMULACAO=false
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.29-alpine@sha256:0c79d56aee561a1d81c63f00eee5fb5fe29279560cdc55e91425133104c7fbe6
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=construcao /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/api/health"]
