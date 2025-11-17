# -----------------------
# 1) Imagem base para build
# -----------------------
FROM node:18-alpine AS builder

WORKDIR /app

# Copia apenas package.json e package-lock/pnpm/yarn antes
COPY package*.json ./

# Instala dependências
RUN npm install --legacy-peer-deps

# Copia o restante dos arquivos
COPY . .

# Faz o build do Next.js
RUN npm run build

# Remove devDependencies
RUN npm prune --production


# -----------------------
# 2) Imagem final de produção
# -----------------------
FROM node:18-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copia apenas os arquivos necessários para rodar
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# Expoe a porta usada no package.json (1010)
EXPOSE 1010

CMD ["npm", "start"]
