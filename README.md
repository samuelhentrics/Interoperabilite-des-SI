# INTEROPERABILITE DES SYSTEMES

## Description du Projet
Ce dépôt présente le prototype fonctionnel développé dans le cadre du module "Interopérabilité des SI".
Ce cas d'étude concerne le secteur du transport ferroviaire et l'interaction entre deux constructeurs de trains, WagonLits et ConstructWagons, et leur sous-traitant critique, DevMateriels.
Le prototype simule la phase de maintenance curative et vise à résoudre les problèmes d'échanges d'informations actuels (utilisation de fichiers Excel par courriel, saisie manuelle dans l'ERP) qui entraînent des incohérences de stock et des pénalités financières.
Ce projet permet de mettre en place une solution interopérable et standardisée pour DevMateriels, permettant de récupérer et de gérer les commandes de ses clients de manière uniforme et automatisée.

==================================================
## ARCHITECURE TECHNIQUE & DEPLOIEMENT

Prérequis
* Docker
* Docker Compose

### DEMARRAGE DU PROTOTYPE
Pour construire les images Docker et lancer l'ensemble des services (APIs, bases de données, outils de monitoring, interfaces) :

--- COMMANDE BASH ---
```bash
docker compose up --build
```
---------------------

### ARRET DES SERVICES
Pour arrêter et supprimer les conteneurs :

--- COMMANDE BASH ---
```bash
docker compose down
```
---------------------

==================================================
## ACCES AUX SERVICES

Une fois le prototype lancé, les différents composants sont accessibles aux adresses suivantes :

* DevMateriels API (Test API) : ```localhost:3000/api/health```
* WagonLits API (Test API) : ```localhost:3001/api/health```
* DevMateriels UI (Interface Web) : ```localhost:4200```
* WagonLits UI (Interface Web) : ```localhost:4201```
* Grafana (Monitoring) : ```localhost:3030```
* PGAdmin (Base de données) : ```localhost:8080```

## Note PGAdmin :
* Email : admin@gmail.com
* Mot de passe : admin

==================================================
## AUTEURS

* Étudiants/Équipe : P. BAUDÉAN, C. ETCHEPARE, S. HENTRICS, C. MARGINIER
* Enseignants : E. BEGON, C. MERLO
  
==================================================
