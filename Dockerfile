# Dockerfile para PianoLink en Fly.io
# Optimizado para Node.js con WebSockets

FROM node:18-alpine

# Crear directorio de trabajo
WORKDIR /app

# Copiar package files primero (mejor cache de Docker)
COPY package*.json ./

# Instalar dependencias de producción solamente
RUN npm ci --only=production

# Copiar código fuente
COPY . .

# Exponer puerto
EXPOSE 3000

# Variables de entorno por defecto
ENV NODE_ENV=production
ENV PORT=3000

# Comando de inicio
CMD ["node", "server.js"]
