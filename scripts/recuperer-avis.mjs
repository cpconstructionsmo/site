/* Récupère les avis Google de la fiche établissement et les écrit dans
   avis.json, au format attendu par la page d'accueil.

   Lancé par .github/workflows/avis.yml, une fois par jour. La clef d'API
   ne quitte jamais GitHub : elle vit dans les secrets du dépôt et n'est
   lue que par ce script, côté serveur. Rien n'est exposé aux visiteurs.

   Deux variables d'environnement sont attendues :
     GOOGLE_API_KEY   clef Google Maps Platform, API « Places » activée
     GOOGLE_PLACE_ID  identifiant de la fiche établissement

   Sans elles, le script s'arrête sans rien casser : avis.json garde son
   contenu précédent. */

import { readFile, writeFile } from 'node:fs/promises';

const CLEF = process.env.GOOGLE_API_KEY;
const FICHE = process.env.GOOGLE_PLACE_ID;
const SORTIE = 'avis.json';

if (!CLEF || !FICHE) {
  console.log('GOOGLE_API_KEY ou GOOGLE_PLACE_ID absent : rien à faire.');
  process.exit(0);
}

// Places API (New). Le masque de champs limite la réponse — et la
// facturation — au strict nécessaire.
const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(FICHE)}`
          + '?languageCode=fr&regionCode=FR';

const champs = [
  'googleMapsUri',
  'rating',
  'userRatingCount',
  'reviews.rating',
  'reviews.text',
  'reviews.relativePublishTimeDescription',
  'reviews.publishTime',
  'reviews.authorAttribution.displayName',
].join(',');

const reponse = await fetch(url, {
  headers: { 'X-Goog-Api-Key': CLEF, 'X-Goog-FieldMask': champs },
});

if (!reponse.ok) {
  console.error(`Google a répondu ${reponse.status} :`, await reponse.text());
  process.exit(1);
}

const fiche = await reponse.json();

// Diagnostic : la fiche peut afficher des avis sur Maps sans que l'API
// les rende (délai de propagation, palier de facturation...). Ce résumé
// permet de voir précisément ce que Google a répondu, sans avoir à
// deviner. Rien de sensible : ce ne sont que des données déjà publiques
// sur la fiche.
console.log('Réponse Google — clefs reçues :', Object.keys(fiche).join(', ') || '(aucune)');
console.log('Réponse Google — contenu :', JSON.stringify(fiche));

const brut = fiche.reviews ?? [];

// L'API ne rend que les avis publics de la fiche, cinq au maximum. On ne
// garde que ceux qui portent un texte : une note nue ne fait pas un
// témoignage lisible.
const avis = brut
  .filter((a) => a.text?.text?.trim())
  .map((a) => ({
    auteur: a.authorAttribution?.displayName ?? 'Client',
    date: a.relativePublishTimeDescription ?? '',
    note: a.rating ?? 5,
    texte: a.text.text.trim(),
  }));

const donnees = {
  lien_google: fiche.googleMapsUri ?? '',
  note_moyenne: fiche.rating ?? null,
  nombre_avis: fiche.userRatingCount ?? null,
  avis,
};

// On ne réécrit le fichier que s'il change vraiment : sinon le dépôt se
// remplirait d'un commit vide par jour.
const nouveau = JSON.stringify(donnees, null, 2) + '\n';
let ancien = '';
try { ancien = await readFile(SORTIE, 'utf8'); } catch { /* premier passage */ }

if (nouveau === ancien) {
  console.log(`Aucun changement (${avis.length} avis).`);
  process.exit(0);
}

await writeFile(SORTIE, nouveau);
console.log(`avis.json mis à jour : ${avis.length} avis, note ${fiche.rating ?? '?'}.`);
