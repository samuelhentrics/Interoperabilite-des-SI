FROM node:20

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Angular écoute sur le port 4200 par défaut
EXPOSE 4200

# Lancer le serveur de dev Angular
CMD ["npm", "start", "--", "--host", "0.0.0.0"]
