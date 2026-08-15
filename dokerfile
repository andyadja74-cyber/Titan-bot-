# Utilise une version stable et légère de Node.js
FROM node:20-slim

# Installe git, ffmpeg (nécessaire pour le traitement vidéo/audio) et nettoie le cache apt
RUN apt-get update && apt-get install -y git ffmpeg && rm -rf /var/lib/apt/lists/*

# Définition du répertoire de travail dans le conteneur
WORKDIR /app

# Copie d'abord package.json et package-lock.json
COPY package*.json ./

# Installation des dépendances du projet
RUN npm install

# Copie le reste des fichiers du projet
COPY . .

# Expose le port
EXPOSE 3000

# Commande pour lancer l'application
CMD ["node", "index.js"]
