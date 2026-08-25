# BGM Management System

Application de gestion pour une entreprise de distribution de farine en sacs : magasins, ventes, stock, trésorerie, fournisseurs, remises par palier. Voir `progress.md` pour l'état d'avancement détaillé et les décisions prises.

## 1. Prérequis

- Node.js 20+
- pnpm (`npm install -g pnpm` si besoin)

## 2. Installation

```bash
pnpm install
```

## 3. Variables d'environnement

Le fichier `.env.local` existe déjà à la racine (ignoré par git). S'il manque, copier `.env.example` :

```bash
cp .env.example .env.local
```

Contenu attendu :

```
DATABASE_URL=file:./dev.db
BETTER_AUTH_SECRET=<une chaîne aléatoire — générer avec: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))">
BETTER_AUTH_URL=http://localhost:3000
```

## 4. Base de données

Le fichier `dev.db` (SQLite) existe déjà à la racine avec des données de test. Pour repartir de zéro :

```bash
pnpm db:push        # applique le schéma (tables métier + auth)
pnpm db:seed        # données de démo (magasins, produits, clients, ventes...)
pnpm db:seed-admin  # crée le compte admin (voir identifiants section 6)
```

⚠️ **Piège connu** : `pnpm db:push` échoue de façon fiable dès qu'on modifie la table `user` (ajout de colonne avec référence). Si ça arrive, voir `progress.md` section 6 pour la procédure de contournement (migration manuelle). Pour un premier `db:push` sur une base neuve, ça fonctionne normalement.

Autres commandes utiles :

```bash
pnpm db:studio  # interface web pour explorer la base
```

## 5. Lancer l'application

```bash
pnpm dev
```

Puis ouvrir [http://localhost:3000](http://localhost:3000) — redirige automatiquement vers `/login` si non connecté.

## 6. Comptes de test

| Rôle | E-mail | Mot de passe | Portée |
|---|---|---|---|
| Administrateur | `admin@bgm.local` | `ChangeMoi123!` | Tous les magasins, toutes les pages |
| Gestionnaire | `gerant.bonapriso@bgm.local` | `GerantPass123!` | BGM Bonapriso uniquement |

Pour créer d'autres comptes : se connecter en admin → menu **Utilisateurs** → "Nouvel utilisateur" (choisir un rôle et, pour un gestionnaire, un magasin).

## 7. Guide de test des fonctionnalités

### 7.1 Tableau de bord (`/`)
- Accessible aux deux rôles ; un gestionnaire ne voit que les chiffres de son magasin.
- Filtrer par période/magasin (le sélecteur magasin est verrouillé pour un gestionnaire).
- Si des créances sont proches de l'échéance (≤ 7 jours) ou en retard, un **bandeau d'alerte** apparaît sous le titre. Pour le tester : créer une vente à crédit avec une échéance courte (Ventes → Nouvelle vente → "À crédit", régler "Échéance (jours)" à 1 ou 2) et revenir sur le tableau de bord.

### 7.2 Ventes (`/ventes`)
- "Nouvelle vente" : choisir un magasin (verrouillé pour un gestionnaire), un client (optionnel = vente comptoir), des articles, et un statut de paiement (payée / partielle / crédit).
- Chaque ligne de la table a un lien **"Facture"** qui ouvre `/ventes/{référence}/facture` dans un nouvel onglet — page imprimable (bouton "Imprimer" en haut). Un gestionnaire ne peut ouvrir que les factures de son propre magasin (404 sinon).
- Bouton **Exporter** (topbar) télécharge la liste affichée en CSV.

### 7.3 Stock (`/stock`)
- "Nouvel article" : crée un produit + stock initial dans un magasin.
- "Réception stock" : ajoute du stock existant (hors flux fournisseur formel).
- **"Comptage physique"** : sélectionner un article + magasin, voir la quantité théorique affichée, saisir la quantité réellement comptée. À la validation : le stock système est corrigé à la valeur comptée, et l'écart apparaît dans le tableau "Écarts récents" en bas de page.

### 7.4 Transferts (`/transferts`)
- "Nouveau transfert" : magasin d'origine (verrouillé pour un gestionnaire — un gestionnaire ne peut transférer QUE depuis son propre magasin) → magasin de destination, articles.
- Le magasin destinataire doit cliquer **"Marquer reçu"** pour que le stock arrive effectivement (le stock quitte l'origine dès la création du transfert, statut "En transit").

### 7.5 Trésorerie (`/tresorerie`) — admin uniquement
- Vue consolidée : ventes comptant, paiements de créances reçus, paiements versés au fournisseur, soldes dus dans les deux sens.
- "Nouvel encaissement" : enregistrer un paiement reçu d'un client (espèces/OM/virement/chèque).

### 7.6 Clients & créances (`/clients`)
- Accessible aux deux rôles ; un gestionnaire ne voit que les clients rattachés à son magasin.
- Bouton **"Encaisser"** (si créance en cours) : enregistrer un paiement partiel ou total.
- Bouton **"Barème"** (admin uniquement) : voir/modifier le barème de remise par palier de ce client (voir 7.9).

### 7.7 Fournisseurs (`/fournisseurs`) — admin uniquement
- "Nouveau fournisseur", puis par ligne :
  - **"Livraison"** : enregistrer une réception (magasin, produit, nombre de sacs, tonnage optionnel pour info, statut de paiement crédit/partiel/payée).
  - **"Payer"** (si dette en cours) : enregistrer un paiement versé au fournisseur.
  - **"Barème"** : barème de remise fournisseur (mêmes paliers que côté client, voir 7.9).

### 7.8 Rapports (`/rapports`) et Magasins (`/magasins`) — admin uniquement
- Rapports : chiffre d'affaires par magasin, top produits, par période.
- Magasins : vue d'ensemble + création de nouveaux magasins.

### 7.9 Remise par palier (barème)
Depuis Clients ou Fournisseurs → bouton "Barème" :
1. Ajouter des paliers : seuil (en sacs/mois) + remise par sac (FCFA). Ex : 5 sacs → 500 F, 10 sacs → 1000 F. "Enregistrer le barème".
2. La ligne au-dessus affiche en direct : sacs déjà écoulés ce mois, palier atteint, ristourne du mois, et "prochain palier dans X sacs".
3. Bouton **"Calculer la ristourne du mois"** : recalcule et enregistre le résultat du mois en cours dans l'historique (visible en bas de la fenêtre). Peut être recliqué à tout moment (recalcul, pas de doublon).
- ⚠️ La remise est **informationnelle uniquement** — elle n'est jamais déduite automatiquement d'une créance ou d'une dette. C'est à l'admin de décider comment l'appliquer (avoir, remboursement...).
- Le calcul est en mode **"cliff"** : atteindre un palier applique la remise à la totalité des sacs du mois, pas seulement à ceux au-dessus du seuil.

### 7.10 Utilisateurs (`/utilisateurs`) — admin uniquement
- "Nouvel utilisateur" : nom, e-mail, mot de passe (8 caractères min.), rôle. Si "Gestionnaire", un magasin est obligatoire.

### 7.11 Export CSV
Disponible via le bouton **Exporter** (topbar) sur Ventes, Stock, Clients, Fournisseurs, Transferts — télécharge la liste actuellement filtrée (période/magasin/recherche) au format CSV.

## 8. Vérifier que tout compile

```bash
npx tsc --noEmit -p tsconfig.json
```

Ne doit rien afficher (aucune erreur).

## 9. Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| `db:push` plante avec `no such column` ou `index ... already exists` | Bug connu de drizzle-kit sur la table `user` lors d'un ALTER | Voir `progress.md` section 6 — migration manuelle via script jetable |
| Après avoir créé un utilisateur en tant qu'admin, on se retrouve déconnecté | Ne devrait plus arriver (corrigé via le plugin `admin` de better-auth) — si ça revient, vérifier qu'aucun code n'appelle `auth.api.signUpEmail` depuis une route serveur | Utiliser `auth.api.createUser` |
| Un gestionnaire voit les données d'un autre magasin | Régression dans `lib/session.ts` ou une route qui n'utilise pas `effectiveStoreParam`/`scopedStoreList` | Vérifier que la route suit le même patron que `app/api/ventes/route.ts` |
