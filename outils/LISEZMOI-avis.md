# Mise à jour automatique des avis Google

`avis.json` alimente le bandeau « Ce qu'ils disent » de la page d'accueil.
Le script `scripts/recuperer-avis.mjs` le rafraîchit depuis Google, et
l'action `.github/workflows/avis.yml` l'exécute **une fois par jour**
ainsi qu'à la demande (onglet *Actions* → *Rafraîchir les avis Google* →
*Run workflow*).

La voie « Places » était déjà en place et explique que le fichier ne
contienne que cinq avis. Ce document décrit surtout la voie à ajouter
pour les avoir **tous**.

Tant qu'aucun secret n'est renseigné, l'exécution ne fait rien et reste au
vert. Rien n'est jamais écrasé si Google est injoignable : en cas de
panne, le fichier existant est conservé tel quel.

---

## Deux voies possibles

|  | Avis récupérés | Ce qu'il faut |
|---|---|---|
| **Business Profile** | **tous** | une autorisation OAuth du propriétaire de la fiche, + accord de Google |
| **Places** (repli) | **5 au maximum** | une simple clé d'API |

Le script essaie la première, et bascule sur la seconde si elle n'est pas
configurée. La limite de cinq avis de l'API Places est une limite de
Google, sans pagination : c'est pourquoi le fichier n'en contenait que
cinq jusqu'ici.

---

## Voie 1 — tous les avis (recommandée)

1. **Demander l'accès à l'API.** Sur
   <https://developers.google.com/my-business/content/prereqs>, remplir le
   formulaire de demande d'accès aux *Business Profile APIs*. Google
   valide en quelques jours. Activer ensuite, dans la console Google
   Cloud, les API `My Business Account Management`,
   `My Business Business Information` et `Google My Business`.

2. **Créer des identifiants OAuth.** Console Cloud → *API et services* →
   *Identifiants* → *Créer* → *ID client OAuth* → type **Application de
   bureau**. Noter l'**ID client** et le **secret client**.

3. **Obtenir un jeton de rafraîchissement.** C'est l'étape à faire une
   seule fois, dans votre navigateur, connecté au compte propriétaire de
   la fiche. Le plus simple est l'OAuth Playground
   (<https://developers.google.com/oauthplayground>) : engrenage en haut
   à droite → cocher *Use your own OAuth credentials* → coller l'ID et le
   secret → dans la liste de gauche, saisir la portée
   `https://www.googleapis.com/auth/business.manage` → *Authorize APIs* →
   *Exchange authorization code for tokens* → copier le **refresh token**.

4. **Enregistrer les secrets** dans le dépôt : *Settings* → *Secrets and
   variables* → *Actions* → *New repository secret*.

   | Nom | Valeur |
   |---|---|
   | `GOOGLE_CLIENT_ID` | l'ID client de l'étape 2 |
   | `GOOGLE_CLIENT_SECRET` | le secret client de l'étape 2 |
   | `GOOGLE_REFRESH_TOKEN` | le jeton de l'étape 3 |

   `GOOGLE_ACCOUNT_ID` et `GOOGLE_LOCATION_ID` sont facultatifs : sans
   eux, le script prend le premier établissement du compte. À renseigner
   seulement si la fiche n'est pas la première de la liste.

---

## Voie 2 — repli, cinq avis

1. Console Cloud → activer **Places API (New)** → créer une **clé d'API**,
   restreinte à cette seule API.
2. Récupérer l'identifiant de l'établissement (*place ID*) avec
   <https://developers.google.com/maps/documentation/places/web-service/place-id>.
3. Enregistrer deux secrets : `GOOGLE_API_KEY` et `GOOGLE_PLACE_ID`.
   **C'est déjà fait sur ce dépôt** — c'est cette voie qui alimente le
   fichier aujourd'hui.

Le champ `reviews` est facturé par Google (environ 40 $ pour mille
requêtes). À raison d'un appel par semaine, cela représente moins de
soixante appels par an, largement couverts par le crédit mensuel offert.

---

## Vérifier que cela fonctionne

Onglet *Actions* → *Rafraîchir les avis Google* → *Run workflow*. Le journal indique la
source retenue et le nombre d'avis. Si `avis.json` a changé, l'action le
publie elle-même, et le site se met à jour dans la foulée.

En local :

```sh
GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... GOOGLE_REFRESH_TOKEN=... \
  node scripts/recuperer-avis.mjs
```

## Ce que le script écarte volontairement

Les avis sans texte — une note seule, sans commentaire — ne sont pas
repris : ils n'ont rien à montrer dans le bandeau. Ils restent en
revanche comptés dans le total et la note moyenne affichés, qui viennent
directement de Google.
