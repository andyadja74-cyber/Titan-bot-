# Utilise une version stable et légère de Node.js
FROM node:18-slim

# Définition du répertoire de travail dans le conteneur
WORKDIR /app

# Copie d'abord package.json et package-lock.json pour utiliser le cache Docker
COPY package*.json ./

# Installation des dépendances du projet
RUN npm install

# Copie le reste des fichiers du projet
COPY . .

# Expose le port (modifie 3000 si ton application utilise un autre port)
EXPOSE 3000

# Commande pour lancer l'application (ajuste 'index.js' si ton fichier principal a un autre nom, ex: 'app.js' ou 'server.js')
CMD ["node", "index.js"]

