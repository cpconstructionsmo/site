/* Récupère les avis Google de la fiche établissement et les écrit dans
   avis.json, au format attendu par la page d'accueil.

   Lancé par .github/workflows/avis.yml, une fois par jour. Les
   identifiants ne quittent jamais GitHub : ils vivent dans les secrets
   du dépôt et ne sont lus que par ce script, côté serveur. Rien n'est
   exposé aux visiteurs.

   Deux voies, essayées dans cet ordre :

     1. API Business Profile — rend TOUS les avis de la fiche. Suppose
        une autorisation OAuth du propriétaire, obtenue une seule fois :
          GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
        et, facultativement, GOOGLE_ACCOUNT_ID / GOOGLE_LOCATION_ID.

     2. API Places — ne demande qu'une clef, mais Google y plafonne la
        réponse à CINQ avis, sans pagination possible :
          GOOGLE_API_KEY, GOOGLE_PLACE_ID

   Sans aucun de ces identifiants, le script s'arrête sans rien casser :
   avis.json garde son contenu précédent. Voir outils/LISEZMOI-avis.md
   pour la mise en place. */

import { readFile, writeFile } from 'node:fs/promises';

const CLEF = process.env.GOOGLE_API_KEY;
const FICHE = process.env.GOOGLE_PLACE_ID;
const SORTIE = 'avis.json';

const OAUTH = {
  id: process.env.GOOGLE_CLIENT_ID,
  secret: process.env.GOOGLE_CLIENT_SECRET,
  rafraichissement: process.env.GOOGLE_REFRESH_TOKEN,
};

const NOTES = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

/* « il y a 6 mois » : l'API Business Profile ne rend qu'une date ISO,
   alors que la page affiche une ancienneté, comme le fait l'API Places. */
function anciennete(iso) {
  const quand = Date.parse(iso);
  if (Number.isNaN(quand)) return '';
  const jours = Math.floor((Date.now() - quand) / 86400000);
  if (jours < 1) return "aujourd'hui";
  if (jours < 7) return jours === 1 ? 'il y a un jour' : `il y a ${jours} jours`;
  if (jours < 31) {
    const s = Math.floor(jours / 7);
    return s === 1 ? 'il y a une semaine' : `il y a ${s} semaines`;
  }
  if (jours < 365) {
    const m = Math.max(1, Math.round(jours / 30.44));
    return m === 1 ? 'il y a un mois' : `il y a ${m} mois`;
  }
  const a = Math.max(1, Math.round(jours / 365.25));
  return a === 1 ? 'il y a un an' : `il y a ${a} ans`;
}

async function json(url, options) {
  const r = await fetch(url, options);
  if (!r.ok) throw new Error(`${url.split('?')[0]} a répondu ${r.status} : ${await r.text()}`);
  return r.json();
}

/* --- Voie 1 : tous les avis, avec l'autorisation du propriétaire --- */
async function viaBusinessProfile() {
  if (!OAUTH.id || !OAUTH.secret || !OAUTH.rafraichissement) return null;

  const jeton = (await json('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: OAUTH.id,
      client_secret: OAUTH.secret,
      refresh_token: OAUTH.rafraichissement,
      grant_type: 'refresh_token',
    }),
  })).access_token;

  const entetes = { Authorization: `Bearer ${jeton}` };

  let compte = process.env.GOOGLE_ACCOUNT_ID;
  let lieu = process.env.GOOGLE_LOCATION_ID;
  if (!compte || !lieu) {
    const comptes = (await json(
      'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
      { headers: entetes })).accounts ?? [];
    if (!comptes.length) throw new Error('aucun compte Business Profile accessible');
    compte ??= comptes[0].name.split('/').pop();
    const lieux = (await json(
      `https://mybusinessbusinessinformation.googleapis.com/v1/accounts/${compte}`
      + '/locations?readMask=name,title&pageSize=100', { headers: entetes })).locations ?? [];
    if (!lieux.length) throw new Error(`aucun établissement sur le compte ${compte}`);
    if (lieux.length > 1 && !lieu) {
      console.warn('Plusieurs établissements ; le premier est retenu :',
                   lieux.map((l) => l.title ?? l.name).join(', '));
    }
    lieu ??= lieux[0].name.split('/').pop();
  }

  const avis = [];
  let page = '';
  let total = null;
  let moyenne = null;
  do {
    const url = `https://mybusiness.googleapis.com/v4/accounts/${compte}/locations/${lieu}`
              + `/reviews?pageSize=50${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`;
    const bloc = await json(url, { headers: entetes });
    total ??= bloc.totalReviewCount ?? null;
    moyenne ??= bloc.averageRating ?? null;
    for (const a of bloc.reviews ?? []) {
      const texte = a.comment?.trim();
      if (!texte) continue;   // une note nue ne fait pas un témoignage
      avis.push({
        auteur: a.reviewer?.displayName?.trim() || 'Client',
        date: anciennete(a.createTime),
        note: NOTES[a.starRating] ?? 5,
        texte,
      });
    }
    page = bloc.nextPageToken ?? '';
  } while (page);

  return { avis, total, moyenne, lien: '', source: 'Business Profile' };
}

if (!CLEF && !OAUTH.rafraichissement) {
  console.log('Aucun identifiant Google configuré : rien à faire '
            + '(voir outils/LISEZMOI-avis.md).');
  process.exit(0);
}

const complet = await viaBusinessProfile().catch((err) => {
  console.error('Business Profile :', err.message);
  return null;
});

if (!complet && !(CLEF && FICHE)) {
  console.error("La voie Business Profile a échoué et aucun repli n'est configuré.");
  process.exit(1);
}

// Voie 2 — repli. Places API (New) : le masque de champs limite la
// réponse — et la facturation — au strict nécessaire.
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

let fiche = {};
if (!complet) {
  const reponse = await fetch(url, {
    headers: { 'X-Goog-Api-Key': CLEF, 'X-Goog-FieldMask': champs },
  });
  if (!reponse.ok) {
    console.error(`Google a répondu ${reponse.status} :`, await reponse.text());
    process.exit(1);
  }
  fiche = await reponse.json();
} else if (CLEF && FICHE) {
  // Business Profile ne rend pas le lien public de la fiche : on le
  // demande à Places quand la clef est là, sans coûter d'avis.
  fiche = await fetch(url, {
    headers: { 'X-Goog-Api-Key': CLEF, 'X-Goog-FieldMask': 'googleMapsUri' },
  }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
}

const brut = fiche.reviews ?? [];

// L'API ne rend que les avis publics de la fiche, cinq au maximum. On ne
// garde que ceux qui portent un texte : une note nue ne fait pas un
// témoignage lisible.
const avis = complet ? complet.avis : brut
  .filter((a) => a.text?.text?.trim())
  .map((a) => ({
    auteur: a.authorAttribution?.displayName ?? 'Client',
    date: a.relativePublishTimeDescription ?? '',
    note: a.rating ?? 5,
    texte: a.text.text.trim(),
  }));

// Le lien public ne vient que de Places : on garde celui déjà en place
// s'il n'a pas pu être redemandé.
let lienExistant = '';
try { lienExistant = JSON.parse(await readFile(SORTIE, 'utf8')).lien_google ?? ''; } catch { /* premier passage */ }

const donnees = {
  lien_google: fiche.googleMapsUri ?? lienExistant,
  note_moyenne: (complet?.moyenne ?? fiche.rating) ?? null,
  nombre_avis: (complet?.total ?? fiche.userRatingCount) ?? null,
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
console.log(`avis.json mis à jour : ${avis.length} avis, note ${donnees.note_moyenne ?? '?'}`
          + `, total ${donnees.nombre_avis ?? '?'} (source ${complet ? complet.source : 'Places'}).`);
