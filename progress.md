# Progress — BGM Management System

Ce fichier sert de mémoire de projet : ce qui existe, comment c'est construit, ce qui reste à faire. À tenir à jour à chaque évolution significative.

Dernière mise à jour : 2026-08-25.

## 1. Contexte métier

BGM (Barry-Gate Multi Service) est une application de gestion pour une entreprise de **distribution de farine en sacs** :
- Un fournisseur (le patron) livre de la farine à crédit, réceptionnée et stockée dans plusieurs magasins (BGM Akwa, Bonapriso, Bastos).
- Dans chaque magasin, un **gestionnaire** vend aux clients grossistes et encaisse (espèces, Mobile Money, virement, chèque, crédit, partiel).
- L'**admin** a une vue globale (tous magasins, trésorerie, fournisseurs, rapports) et gère les comptes utilisateurs.
- Remises par palier mensuelles, à la fois côté fournisseur (achats) et côté clients (ventes), selon un barème configurable par entité.

## 2. Stack technique

- **Next.js 16** (App Router) + **React 19**, UI 100% en français.
- **Base de données** : SQLite en local via `@libsql/client` + `drizzle-orm/libsql`. **Ne jamais utiliser `better-sqlite3`** — plante sur cette machine (voir section 6).
- **Auth** : `better-auth` (email/mot de passe) + plugin `admin` pour la création d'utilisateurs par un admin. Rôles `admin` / `gestionnaire`, stockés en texte libre (pas un enum SQL) pour rester extensible.
- Schéma métier dans `lib/db/schema.ts`, schéma auth dans `lib/db/auth-schema.ts` (fusionnés dans le client drizzle via `lib/db/client.ts`).
- Chaque domaine a ses fichiers `lib/db/queries/<domaine>.ts` et `lib/db/mutations/<domaine>.ts`, réexportés par un barrel `index.ts` — toujours ajouter les nouvelles fonctions au barrel.
- Toute mutation qui touche `stockLevels` est enveloppée dans `db.transaction()` (atomicité + évite les races de stock).

## 3. Fonctionnalités livrées

### Cœur métier (déjà présent avant cette série de sessions)
- Multi-magasins, stock séparé par magasin, mouvements de stock (réception/vente/transfert/ajustement).
- Ventes avec statut de paiement (payée / partielle / crédit), factures liées, créances clients.
- Trésorerie consolidée, transferts inter-magasins avec confirmation de réception.

### Rôles et accès (session du 24-25/08)
- `user.storeId` + rôle `admin`/`gestionnaire` réellement appliqués côté serveur (`lib/session.ts`) : un gestionnaire est verrouillé sur son magasin sur toutes les routes (Ventes, Stock, Transferts) ; Trésorerie, Fournisseurs, Rapports, Magasins (création), Utilisateurs sont réservés admin.
- Page **Utilisateurs** (admin) pour créer des comptes — utilise le plugin admin de better-auth (`auth.api.createUser`), **pas** `signUpEmail` (qui écraserait la session de l'admin appelant, bug rencontré et corrigé — voir section 6).

### Fournisseurs
- Fiche fournisseur, livraisons (sacs + tonnage optionnel), créances fournisseur, paiements (espèces/OM/virement/**chèque**).
- Miroir exact du module Clients (mêmes conventions de query/mutation/UI).

### Correctifs de fiabilité
- `createSale` sécurisé par transaction DB (corrige un vrai bug de paiement partiel non comptabilisé + une race condition de survente en cas de ventes simultanées).

### Remise par palier (module générique)
- Un seul système pour les remises fournisseur ET client (`lib/db/mutations/discounts.ts`), basé sur `discountScales`/`discountTiers`/`discountApplications`.
- **Palier "cliff"** : atteindre un seuil applique la remise à TOUS les sacs du mois (pas un calcul marginal).
- **Calcul en fin de mois à la demande** (bouton "Calculer"), informationnel — n'affecte jamais automatiquement une créance/dette existante.
- Compteur en direct "sacs restants avant palier suivant".
- UI partagée `components/discount-scale-modal.tsx`, accessible via un bouton "Barème" depuis Clients et Fournisseurs (admin uniquement).

### Alertes d'échéance
- Bandeau sur le tableau de bord, calculé en direct depuis `receivables.dueDate` (le statut `overdue` n'est jamais mis à jour automatiquement nulle part dans le code — ne pas s'y fier).
- Gestionnaire : uniquement les créances clients de son magasin. Admin : + les dettes fournisseur.

### Facture imprimable
- `/ventes/{référence}/facture` — page serveur sans sidebar, bouton Imprimer.
- Premier endpoint "single record" de l'app (`getSaleDetail`). Accès vérifié par magasin pour un gestionnaire.

### Inventaire physique
- Bouton "Comptage physique" sur la page Stock. Le comptage devient la nouvelle vérité système (`stockLevels` mis à jour), écart tracé comme mouvement `adjustment`, historique des écarts affiché sur la page.

### Export CSV
- `lib/csv.ts` + paramètre `?format=csv` sur les routes Ventes/Stock/Clients/Fournisseurs/Transferts.
- Bouton "Exporter" de la sidebar (jusque-là décoratif) branché via une prop `onExport` sur `AppShell`.

## 4. Comptes de test

| Rôle | E-mail | Mot de passe | Magasin |
|---|---|---|---|
| Admin | `admin@bgm.local` | `ChangeMoi123!` | tous |
| Gestionnaire | `gerant.bonapriso@bgm.local` | `GerantPass123!` | BGM Bonapriso |

Voir `README.md` pour en créer d'autres.

## 5. Dette technique / points ouverts

- **Pas de sélecteur de méthode de paiement à la vente** — `createSale` force `method: 'cash'` pour la part payée immédiatement d'une vente partielle. À ajouter si besoin de distinguer OM/virement/chèque dès la vente.
- **Remise par palier** : calcul déclenché manuellement (bouton "Calculer"), pas de tâche planifiée à minuit — aucune infra de cron dans l'appli. Un vrai calcul automatique en fin de mois nécessiterait un scheduler externe (ex: Vercel Cron) appelant `computeDiscount` pour chaque barème.
- **Rapports** : page existante mais pas d'export CSV dessus (contrairement aux 5 autres pages).
- Aucun test automatisé (unit/e2e) — toutes les vérifications de cette série de sessions ont été faites manuellement via des scripts PowerShell contre le serveur de dev (voir historique de conversation pour le détail des cas testés).

## 6. Pièges connus (à lire avant de toucher au schéma ou à l'auth)

1. **`pnpm db:push` échoue de façon fiable sur la table `user`** dès qu'on y ajoute une colonne avec référence FK (`SQLITE_ERROR: no such column`, puis `index user_email_unique already exists` au retry) — sa stratégie de recréation de table sur SQLite ne gère pas bien cette table. **Solution appliquée à chaque fois** : écrire un script jetable `lib/db/_manual-migrate.ts` qui exécute des `ALTER TABLE`/`CREATE TABLE IF NOT EXISTS` bruts via `@libsql/client`, l'exécuter, puis le supprimer. Le schéma drizzle reste la source de vérité ; `db:push` continuera d'échouer après coup sur `user`, c'est sans conséquence puisque la base réelle est déjà à jour. Pour les tables 100% nouvelles (sans toucher `user`/`session`), `db:push` fonctionne normalement.
2. **Ne jamais appeler `auth.api.signUpEmail` depuis une route pour créer un compte au nom d'un autre utilisateur.** Le plugin `nextCookies()` attache automatiquement le cookie de session produit par cet appel à la réponse HTTP en cours — un admin qui crée un gestionnaire via `signUpEmail` se retrouve donc déconnecté de son propre compte et reconnecté sur le nouveau. Utiliser le plugin `admin` de better-auth (`auth.api.createUser`) à la place — c'est fait pour ça et ça ne touche pas la session de l'appelant.
