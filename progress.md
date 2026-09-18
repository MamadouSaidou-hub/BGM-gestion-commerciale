# Progress — BGM Management System

Ce fichier sert de mémoire de projet : ce qui existe, comment c'est construit, ce qui reste à faire. À tenir à jour à chaque évolution significative.

Dernière mise à jour : 2026-09-04.

## 1. Contexte métier

BGM (Barry-Gate Multi Service) est une application de gestion pour une entreprise de **distribution de farine en sacs** :
- Un fournisseur (le patron) livre de la farine à crédit, réceptionnée et stockée dans plusieurs magasins (BGM Akwa, Bonapriso, Bastos).
- Dans chaque magasin, un **gestionnaire** vend aux clients grossistes et encaisse (espèces, Mobile Money, virement, chèque, crédit, partiel).
- L'**admin** a une vue globale (tous magasins, trésorerie, fournisseurs, rapports) et gère les comptes utilisateurs.
- Remises par palier mensuelles, à la fois côté fournisseur (achats) et côté clients (ventes), selon un barème configurable par entité.

## 2. Stack technique

- **Next.js 16** (App Router) + **React 19**, UI 100% en français.
- **Base de données** : **Postgres (Supabase en production)** via `pg` + `drizzle-orm/node-postgres` (migré début sept. 2026, voir section 7 — auparavant SQLite via `@libsql/client`, ne plus utiliser). `lib/db/client.ts` valide `DATABASE_URL` au démarrage (erreur claire si absent), configure `ssl`, un pool borné (`max: 5`) et un handler `pool.on('error', ...)` pour éviter qu'une coupure réseau ne fasse planter tout le process.
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

### Remise par palier (module générique — deux modes de calcul distincts)
- Un seul système pour les remises fournisseur ET client (`lib/db/mutations/discounts.ts`), basé sur `discountScales`/`discountTiers`/`discountApplications`.
- **Palier "cliff"** dans les deux cas : atteindre un seuil applique la remise à TOUS les sacs comptés (pas un calcul marginal par tranche).
- **Côté client (grossiste)** : modèle **mensuel**, remise à zéro chaque calendrier — calcul à la demande (bouton "Calculer"), informationnel, n'affecte jamais automatiquement une créance existante.
- **Côté fournisseur** : modèle **cyclique sans limite de temps** (précisé par le client début sept. 2026) — `discountScales.cycleStartAt` marque le début du cycle en cours ; dès que le cumul de sacs livrés depuis ce point atteint le plus haut palier configuré, la remise est **accordée automatiquement** (déclenchée depuis `recordSupplierDelivery`, best-effort — ne bloque jamais l'enregistrement d'une livraison si ça échoue) et le cycle repart à zéro. Le bouton "Vérifier le palier" reste dispo pour forcer une vérification manuelle. Le dépassement au-delà du palier lors d'une même livraison est inclus dans le montant remisé de ce cycle, puis n'est pas reporté sur le suivant.
- Compteur en direct "sacs restants avant palier suivant" dans les deux modes.
- UI partagée `components/discount-scale-modal.tsx` (libellés adaptés au mode), accessible via un bouton "Barème" depuis Clients et Fournisseurs (admin uniquement).
- **Piège rencontré et corrigé** : `cycleStartAt` est comparé à `supplierDeliveries.createdAt` (rempli par `CURRENT_TIMESTAMP` de SQLite, format `"YYYY-MM-DD HH:MM:SS"`). Il **doit** être stocké dans ce même format — pas `Date#toISOString()` (`"...THH:MM:SS.sssZ"`), sinon la comparaison en chaîne de caractères devient fausse pour deux horodatages du même jour (`' ' < 'T'` en ASCII). Et la comparaison de bornure doit être stricte (`gt`, pas `gte`) car SQLite n'a qu'une résolution à la seconde — la livraison qui déclenche l'octroi et la remise à zéro qui suit peuvent tomber dans la même seconde. Voir [[bgm-auth-quirks]] pour les autres pièges de ce type sur ce projet.

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
- **Tests automatisés** : un socle existe désormais (voir section 8) — `lib/session.ts` (unitaire) + ventes/transferts/remise fournisseur (intégration). Pas de couverture e2e navigateur, pas de tests sur les autres mutations (paiements, comptage physique, etc.).
- ~~Requêtes séquentielles non parallélisées (`dashboard.ts`, `treasury.ts`)~~ — **corrigé le 15/09** (voir section 9).
- `getTransfersList` utilise encore 2 sous-requêtes corrélées par ligne (SQL) au lieu d'un JOIN/GROUP BY — c'est une seule requête réseau donc peu prioritaire, mais un JOIN serait plus propre si retouché un jour.

## 6. Pièges connus (à lire avant de toucher au schéma ou à l'auth)

1. **`pnpm db:push` échouait de façon fiable sur la table `user`** sous SQLite dès qu'on y ajoutait une colonne avec référence FK — sa stratégie de recréation de table ne gérait pas bien cette table. **Spécifique à SQLite** : Postgres fait un simple `ALTER TABLE ADD COLUMN` sans reconstruction, ce piège ne devrait plus se reproduire post-migration — mais si `db:push` échoue étrangement sur une table auth après migration, la solution de contournement (script jetable `ALTER TABLE`/`CREATE TABLE IF NOT EXISTS` bruts, exécuté puis supprimé) reste valable quel que soit le moteur.
2. **Ne jamais appeler `auth.api.signUpEmail` depuis une route pour créer un compte au nom d'un autre utilisateur.** Le plugin `nextCookies()` attache automatiquement le cookie de session produit par cet appel à la réponse HTTP en cours — un admin qui crée un gestionnaire via `signUpEmail` se retrouve donc déconnecté de son propre compte et reconnecté sur le nouveau. Utiliser le plugin `admin` de better-auth (`auth.api.createUser`) à la place — c'est fait pour ça et ça ne touche pas la session de l'appelant.
3. **Un seul formateur de timestamp par colonne, jamais deux.** `lib/db/schema.ts`'s `timestamps.createdAt` génère `new Date().toISOString()` côté JS (pas un défaut SQL `now()`/`current_timestamp`) pour que toute comparaison de chaîne (`gte`/`gt`/`lt` sur des colonnes `text`) reste cohérente. Un bug réel a été introduit puis corrigé pendant la migration Postgres : `lib/db/mutations/discounts.ts` reformatait encore `cycleStartAt` à l'ancien style SQLite (`"YYYY-MM-DD HH:MM:SS"`) alors que `createdAt` produisait déjà le nouveau format ISO complet — la comparaison entre les deux devenait fausse pour deux horodatages du même jour. Si un jour une colonne timestamp a besoin d'un formatage custom, ne JAMAIS le dupliquer ailleurs — importer/réutiliser la même fonction que celle qui alimente `timestamps.createdAt`.

## 7. Migration SQLite → Postgres (04/09/2026) et audit pré-déploiement

Décidé avec l'utilisateur : passage à Supabase (Postgres), pas Turso, pour rester sur le plan d'origine malgré l'effort de migration plus élevé (voir mémoire de session pour le détail des alternatives pesées).

**Changements de schéma** (`lib/db/schema.ts`, `lib/db/auth-schema.ts`) :
- `sqlite-core` → `pg-core` partout ; `integer(...).primaryKey({autoIncrement:true})` → `serial(...).primaryKey()`.
- **Montants/quantités décimales** (`unitPrice`, `totalAmount`, `amount`, `tonnage`, `discountPerSack`...) : `real()` de pg-core est un float 4 octets (~7 chiffres significatifs), contrairement à SQLite où `real` est toujours un double 8 octets — changement silencieux de précision repéré à l'audit. **Corrigé** : `doublePrecision()` partout à la place, pour retrouver la précision d'avant.
- `timestamps.createdAt` reste une colonne `text` (ISO string généré en JS, voir piège #3 ci-dessus) plutôt qu'un `timestamp` natif — choix délibéré pour limiter la casse sur tout le code appelant qui fait déjà `.toISOString()`/`new Date(row.createdAt)`. Les tables auth (`user`, `session`, `account`, `verification`), elles, utilisent bien `timestamp(..., { withTimezone: true })` natif — c'est ce qu'attend l'adaptateur Postgres de better-auth.
- `lib/db/client.ts` : `pg.Pool` avec `ssl` (auto-désactivé en local), `max: 5`, `idleTimeoutMillis`/`connectionTimeoutMillis`, un handler `pool.on('error', ...)` (sans ça, une coupure réseau sur une connexion idle fait planter tout le process Node), et une erreur claire au démarrage si `DATABASE_URL` est absent (avant : repli silencieux vers les identifiants libpq par défaut, potentiellement une connexion silencieuse à une mauvaise base).

**Audit pré-déploiement** : revue de sécurité (rien trouvé — le diff de migration ne touche aucune route/entrée utilisateur) + revue de code multi-angles sur le diff complet. Tous les points ci-dessus ont été corrigés. Restent en dette technique (section 5) : les patterns de requêtes séquentielles non parallélisées, présents avant la migration mais plus coûteux maintenant que chaque requête traverse le réseau.

**Connexion à la vraie base (04/09/2026)** : projet Supabase créé sur un compte séparé (limite de 2 projets gratuits atteinte sur le compte connecté à l'outil Claude). Deux pièges rencontrés pour obtenir une chaîne de connexion qui fonctionne réellement depuis cette machine :
- La **connexion directe** (`db.<ref>.supabase.co:5432`) ne résout qu'en IPv6 — inutilisable sur un réseau sans route IPv6 (confirmé via `Resolve-DnsName -Type AAAA`). **Toujours utiliser le pooler** (`*.pooler.supabase.com`, compatible IPv4).
- Le **shard du pooler n'est pas forcément `aws-0-<région>`** — pour ce projet (région `eu-west-1` affichée dans le dashboard), c'était `aws-1-eu-west-1.pooler.supabase.com`. `aws-0-...` répondait mais renvoyait `tenant/user ... not found` (le pooler est mutualisé entre plusieurs shards par région, le numéro n'est pas déductible de la région seule). En cas de doute, tester plusieurs shards (`aws-0-`, `aws-1-`, ...) avec une connexion `pg` brute plutôt que deviner — `drizzle-kit`/`pnpm db:push` n'affichent pas l'erreur réelle du driver, un script `pg.Client` direct la révèle.

Une fois la bonne URL trouvée : `db:push` (22 tables créées), `db:seed`, `db:seed-admin` exécutés avec succès, puis testé en conditions réelles (`pnpm dev` pointé sur la vraie base) — connexion admin, chargement de toutes les pages, création d'une vente avec vérification du stock/trésorerie, et test bout-en-bout du cycle de remise fournisseur corrigé (5 puis +6 sacs → palier de 10 franchi, remise accordée sur les 11 sacs, compteur remis à 0). Tout fonctionne.

**Pas encore fait à cette date** : le déploiement Vercel (l'utilisateur l'a géré lui-même de son côté par la suite).

## 8. Catalogue farine uniquement, vente en tonnes, et socle de tests (15/09/2026)

**Catalogue farine + vente en tonnes** :
- `products.sackWeightKg` (nullable, `doublePrecision`) — poids d'un sac en kg. `null` = produit vendable uniquement en sacs.
- `saleItems.unit` (`'sack' | 'tonne'`, défaut `'sack'`) et `saleItems.tonnage` (nullable) — `quantity` reste **toujours** le nombre de sacs, quel que soit le mode de saisie ; `unit`/`tonnage` ne servent qu'à l'affichage/l'audit. Tout le reste (stock, cycle de remise) continue de lire `quantity` sans changement.
- `createSale` (`lib/db/mutations/sales.ts`) : si `unit === 'tonne'`, calcule `quantity = Math.round((tonnage * 1000) / sackWeightKg)` ; lève une erreur claire si le produit n'a pas de `sackWeightKg` configuré. Le reste de la logique (vérif. stock, transaction) est inchangé.
- UI (`components/sales-view.tsx`) : toggle Sac/Tonne par ligne d'article, indice "≈ N sacs" en direct quand le mode Tonne est actif ; option Tonne désactivée si le produit n'a pas de poids de sac configuré.
- Ajout du champ optionnel "Poids du sac (kg)" au formulaire de création de produit (`components/stock-view.tsx`).
- `lib/db/seed.ts` réécrit avec un catalogue 100% farine (6 SKUs : blé T55, complète, boulangère, pâtissière ; 25kg et 50kg selon le produit) — chacun avec `sackWeightKg` renseigné. Nécessitait aussi d'ajouter la suppression de `supplierDeliveries`/`supplierPayables`/`supplierPayments`/`suppliers`/`discountApplications`/`discountTiers`/`discountScales`/`stockCounts` au début du script (absent jusqu'ici) — sans ça, `db:seed` échouait sur une contrainte FK dès qu'une livraison fournisseur avait été enregistrée en base (ce qui était le cas suite aux tests manuels de la section 7).

**Socle de tests (Vitest)** : `vitest` (v3, pas v5 — better-auth déclare un peer dep `vitest ^2||^3||^4`) + `dotenv` en devDependencies. `vitest.config.ts` (environnement Node, alias `@` résolu manuellement car Vitest ne lit pas `tsconfig.json` nativement), `tests/setup.ts` charge `.env.local`. Script `pnpm test`.
- `tests/session.test.ts` — unitaire pur, pas de DB (`isAdmin`, `effectiveStoreParam`, `scopedStoreList`).
- `tests/discounts.test.ts`, `tests/sales.test.ts`, `tests/transfers.test.ts` — intégration, contre la **vraie base Supabase** (pas de base de test séparée disponible sur le plan gratuit). Chaque test crée ses propres fixtures (magasin/produit/client/fournisseur) suffixées par un id de run unique, et les supprime par id dans `afterAll` — jamais de `TRUNCATE`/suppression globale sur une table partagée. `tests/discounts.test.ts` re-teste exactement le scénario de la section 7 (palier franchi → remise sur le total cumulé, compteur remis à 0).
- 17 tests, tous verts, exécutés contre la vraie base après le `db:push`/`db:seed` de cette session.

**Piège rencontré** : `pnpm db:push`/`db:seed` échouent avec `DATABASE_URL is not set` quand lancés directement depuis PowerShell, car `drizzle.config.ts` lit `process.env.DATABASE_URL` sans jamais charger `.env.local` lui-même (Next.js le fait automatiquement en dev, mais pas les scripts CLI). Contournement utilisé : injecter les variables de `.env.local` dans l'environnement PowerShell avant d'appeler la commande (`Get-Content .env.local | ... SetEnvironmentVariable`). À reproduire à l'identique si `db:push`/`db:seed`/`db:seed-admin` sont relancés manuellement hors de `next dev`.

**Vérifié en conditions réelles** : après `db:push` + `db:seed`, connexion admin via `pnpm dev` pointé sur la vraie base, catalogue confirmé 100% farine via `/api/products`, et une vente en tonnes testée bout-en-bout via l'API réelle (0.5 tonne d'un produit à 25kg/sac → 20 sacs déduits du stock, montant total correct).

**Déploiement Vercel** : après le push, l'utilisateur a rencontré une erreur "Invalid origin" de better-auth au login en prod — cause : `BETTER_AUTH_URL` sur Vercel ne correspondait pas à l'URL réelle du déploiement (`https://bgm-gestion-commerciale.vercel.app`). Corrigé en éditant la variable d'env sur Vercel (Project Settings → Environment Variables → "..." sur la ligne → Edit) puis en relançant un déploiement (les variables d'env ne s'appliquent qu'au prochain build, pas rétroactivement).

## 9. Parallélisation des requêtes dashboard/trésorerie (15/09/2026)

`lib/db/queries/dashboard.ts` et `treasury.ts` enchaînaient une dizaine de `await` indépendants les uns après les autres — chacun un aller-retour réseau complet vers Supabase. Remplacé par un seul `Promise.all` par fichier regroupant toutes les requêtes qui ne dépendent pas les unes des autres (y compris la boucle des 7 jours de `salesTrend`, auparavant 7 requêtes séquentielles, désormais lancées en parallèle). Seule exception laissée séquentielle : la requête du nom du magasin de destination d'un transfert en cours, qui dépend du résultat de la requête précédente (`pendingTransfer.toStoreId`) — un seul cas, coût négligeable.

Vérifié : `tsc` propre, les 17 tests Vitest toujours verts, et un test manuel via `pnpm dev` confirmant que `/api/dashboard` et `/api/tresorerie` renvoient des données identiques (mêmes montants, même tendance sur 7 jours) après le changement.

## 10. Résilience réseau — connexion faible/instable (18/09/2026)

**Contexte** : l'utilisateur signale une connexion internet peu fiable en Guinée. Audit du code : aucun des ~20 appels `fetch()` de chargement de liste n'avait de gestion d'erreur réseau — si la connexion lâchait en cours de requête, la page restait bloquée en "chargement..." indéfiniment (aucun `.catch`, promesse rejetée jamais gérée). Les formulaires de création/édition (POST/PATCH) avaient un `try/finally` qui réactivait bien le bouton, mais sans `catch` : en cas de coupure, aucun message n'était affiché à l'utilisateur.

**Corrigé** :
- `lib/fetch-json.ts` — nouveau helper `fetchJson<T>(url, options, { retries, timeoutMs })` : timeout (15s par défaut, via `AbortController`), **un seul retry automatique** en cas d'échec réseau (backoff court), et lève toujours une erreur avec un message français clair (distinguant panne réseau vs erreur API). Le retry automatique n'est utilisé que pour les requêtes `GET` (idempotentes) — jamais pour les `POST`/`PATCH`/`DELETE`, où retenter automatiquement pourrait dupliquer une action déjà passée côté serveur (ex : créer une vente deux fois) si seule la réponse s'est perdue.
- `components/load-error.tsx` — petit composant réutilisable : message d'erreur + bouton "Réessayer".
- Appliqué à **toutes** les pages avec chargement de données (Tableau de bord, Ventes, Stock, Clients, Fournisseurs, Transferts, Trésorerie, Rapports, Magasins, Utilisateurs, + la modale Barème de remise) : le chargement principal utilise `fetchJson` avec état d'erreur affiché + retry ; les données secondaires (listes déroulantes magasins/produits/clients pour les formulaires) utilisent `fetchJson` avec échec silencieux (`catch(() => {})`) pour ne pas bloquer toute la page si une donnée non critique échoue.
- Tous les formulaires de soumission (`POST`/`PATCH`/`DELETE`) ont désormais un `catch` explicite affichant "Connexion instable — réessayez" au lieu d'échouer silencieusement.

**Non traité** (hors périmètre de ce changement, à signaler si demandé) : pas de vrai mode hors-ligne (pas de service worker, pas de queue de synchronisation) — l'app a toujours besoin d'une connexion pour fonctionner, elle est juste beaucoup plus tolérante aux coupures/lenteurs ponctuelles maintenant, avec un retour visuel clair au lieu d'un écran figé.

Vérifié : `tsc` propre, les 17 tests Vitest toujours verts, et un test manuel via `pnpm dev` confirmant que toutes les pages se chargent normalement et que les données API sont inchangées après le refactor.

## 11. Index de base de données pour la montée en charge (18/09/2026)

**Contexte** : question de l'utilisateur sur la tenue en charge avec plusieurs utilisateurs simultanés. Audit : Postgres n'indexe **pas automatiquement** les clés étrangères (contrairement à SQLite qui gérait tout en un seul fichier local sans coût réseau) — aucune des colonnes utilisées dans les `WHERE`/`JOIN` fréquents (`storeId`, `clientId`, `supplierId`, `createdAt` pour les filtres de période, etc.) n'avait d'index au-delà des clés primaires.

**Corrigé** : 37 index ajoutés dans `lib/db/schema.ts` et `lib/db/auth-schema.ts` (syntaxe `pgTable(name, columns, (table) => [index(...).on(...)])`), couvrant toutes les colonnes identifiées par un grep systématique des `eq()`/`gte()`/`lt()` dans `lib/db/queries/*.ts` et `lib/db/mutations/*.ts`. Le plus chaud : `discount_scales_party_idx` sur `(party_type, party_id)` — `getOrCreateScale()` est appelé à chaque vente et chaque livraison fournisseur. Poussé sur la vraie base via `db:push`, vérifié directement en base (37 index confirmés présents via `pg_indexes`).

**Ce que ça change concrètement** : sans index, Postgres doit parcourir toute la table (`sales`, `stock_movements`, etc.) pour chaque requête filtrée — acceptable avec peu de lignes, mais le temps de réponse se dégrade linéairement avec le volume de données, et se dégrade encore plus vite si plusieurs utilisateurs interrogent en même temps (plus de scans complets concurrents = plus de pression sur le peu de connexions disponibles). Les index rendent ces requêtes quasi-instantanées indépendamment du nombre de lignes.

**Limites non traitées, à garder en tête si l'usage grossit vraiment** :
- Le pool de connexions applicatif est volontairement petit (`max: 5` dans `lib/db/client.ts`) car chaque route Vercel est une fonction serverless indépendante qui ouvre son propre pool — avec beaucoup de trafic simultané, le nombre total de connexions vers le pooler Supabase peut quand même grimper. Le connection pooler de Supabase (PgBouncer, déjà utilisé via l'URL `*.pooler.supabase.com:6543`) absorbe une bonne partie de ça, mais le **plan gratuit Supabase a un plafond de connexions/calcul** — si le nombre d'utilisateurs actifs simultanés devient réellement important (au-delà d'une poignée de magasins), passer sur un plan payant Supabase sera probablement nécessaire. C'est une décision business/coût, pas quelque chose de réglable uniquement dans le code.
- Toujours aucun cache HTTP/SWR côté client — chaque changement de page recharge tout depuis zéro. Pas critique à l'échelle actuelle, mais à revisiter si le nombre de pages vues par utilisateur augmente beaucoup.

Vérifié : `tsc` propre, `db:push` appliqué avec succès, 37 index confirmés en base, les 17 tests Vitest toujours verts.

## 12. Page Rapports enrichie + export PDF/Excel (18/09/2026)

**Backend** (`lib/db/queries/reports.ts`, réécrit) : en plus du CA par magasin et du top produits déjà existants, ajoute — marge brute et % de marge, nombre de ventes et panier moyen, une courbe d'évolution des ventes sur la période (buckets horaires pour "Aujourd'hui", journaliers sinon), le top clients par CA, la répartition par statut de paiement (payée/partielle/crédit), et un résumé fournisseurs (sacs reçus, nb livraisons, montant payé). Toutes les requêtes indépendantes tournent en `Promise.all` (même principe que la section 9). Les valeurs numériques brutes sont renvoyées en plus des chaînes déjà formatées, pour que les graphiques et les exports Excel disposent de vrais nombres (pas de re-parsing de `"1 234 FCFA"`).

**Frontend** (`components/reports-view.tsx`, réécrit) : 4 cartes indicateurs, un graphique en barres pour l'évolution des ventes (réutilise le style déjà en place sur le tableau de bord), un classement en barres horizontales pour magasins/produits/clients (nouveau composant `RankBar`, nouvelles classes CSS `.rank-bar-*`), et une répartition des statuts de paiement avec code couleur cohérent avec le reste de l'app (vert=payée, orange=partielle, bleu=crédit — même mapping que `sales-view.tsx`). Couleurs et code couleur suivent la méthode du skill `dataviz` (une teinte par série pour une grille de magnitude, teintes catégorielles fixes pour les statuts).

**Piège corrigé au passage** : `.bar-chart` (graphique en barres, réutilisé du tableau de bord) n'avait ni `min-width: 0` ni `overflow-x: auto` — avec jusqu'à ~30 barres journalières sur la vue "Ce mois-ci", ça aurait pu reproduire le bug de débordement horizontal déjà corrigé en section précédente. Corrigé en ajoutant les deux, avec `flex-shrink: 0` sur `.bar-group` pour que les barres scrollent au lieu de se tasser. Découvert au passage : `dashboard-view.tsx` référençait déjà une classe `.blue-dot` qui n'existait nulle part dans `globals.css` (4ᵉ magasin sans couleur) — ajoutée.

**Export** (`lib/export-report.ts`, nouveau) : deux fonctions client-side, déclenchées par deux boutons dans la barre d'outils de la page.
- `exportReportPdf` — via `jspdf` + `jspdf-autotable` : titre, indicateurs clés, tableaux (magasins, statuts de paiement, top produits, top clients, fournisseurs), pagination automatique, numéros de page.
- `exportReportExcel` — via `xlsx` (SheetJS) : classeur à 6 onglets (Résumé, Évolution ventes, Par magasin, Statuts paiement, Top produits, Top clients), valeurs numériques brutes (pas de texte formaté) pour que les montants restent exploitables (tri, formules) dans Excel.

Les deux s'exécutent entièrement côté navigateur (aucun appel serveur, aucune dépendance à un service externe) — fonctionne même sur une connexion lente une fois la page chargée.

Vérifié : `tsc` propre, API testée sur les 3 périodes (aujourd'hui/7j/mois) avec des données réelles, page chargée sans erreur, les 17 tests Vitest toujours verts. La logique de génération PDF/Excel elle-même a été testée directement en Node (script jetable, supprimé après usage) avec des données réalistes — `jsPDF`/`autoTable` et `XLSX.write` s'exécutent sans erreur et produisent des fichiers valides (PDF 2 pages, classeur Excel à plusieurs onglets). Reste non vérifié : le rendu visuel réel dans le navigateur (pas d'outil de capture d'écran disponible) et le déclenchement du téléchargement par clic — à confirmer par l'utilisateur.
