# Etapa 1: Compilación
FROM node:18-alpine AS builder

WORKDIR /app

# Copiar archivos de configuración e instalar dependencias
COPY frontend/package.json /app/
RUN npm install

# Copiar código fuente y compilar
COPY frontend/ /app/
RUN npm run build

# Etapa 2: Servidor Web Nginx
FROM nginx:1.18-alpine

# Copiar la compilación estática a la carpeta de Nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Exponer el puerto estándar
EXPOSE 80

# Comando para iniciar Nginx
CMD ["nginx", "-g", "daemon off;"]
