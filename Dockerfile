# Utilisation d'une image Python basée sur Debian (slim pour être léger)
FROM python:3.10-slim

# Évite que Python n'écrive des fichiers .pyc et force l'affichage direct des logs
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Installe les dépendances système requises (avec libstdc++6 au lieu de stdc++6)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libstdc++6 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Définition du répertoire de travail
WORKDIR /app

# Copie d'abord les fichiers de dépendances pour profiter du cache Docker
COPY requirements.txt /app/

# Installation des dépendances Python
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Copie du reste du code de l'application
COPY . /app/

# Expose le port (ajuste selon ton besoin, ex: 8000, 5000, 10000)
EXPOSE 10000

# Commande pour démarrer l'application
CMD ["python", "main.py"]
