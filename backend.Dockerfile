FROM python:3.10-slim

# Evitar que Python escriba archivos pyc en disco
ENV PYTHONDONTWRITEBYTECODE=1
# Evitar que Python almacene en búfer stdout y stderr
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Instalar dependencias del sistema necesarias
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libc-dev \
    && rm -rf /var/lib/apt/lists/*

# Instalar dependencias de Python
COPY backend/requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copiar el código del backend
COPY backend/ /app/

# Exponer el puerto del servidor
EXPOSE 8000

# Por defecto, correremos migraciones y levantaremos el servidor de desarrollo
CMD ["sh", "-c", "python manage.py migrate && python manage.py runserver 0.0.0.0:8000"]
