#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Met à jour avis.json depuis Google, sans dépendance extérieure.

Deux sources possibles, essayées dans cet ordre :

  1. API Business Profile — rend la TOTALITÉ des avis, mais suppose une
     autorisation OAuth du propriétaire de la fiche (jeton de
     rafraîchissement obtenu une fois pour toutes).
  2. API Places (nouvelle) — ne demande qu'une clé, mais plafonne à
     cinq avis. Sert de repli, et permet au moins de garder la note
     moyenne et le nombre total d'avis exacts.

Le script n'écrit rien s'il ne récupère aucun avis : mieux vaut laisser
le fichier en place que le vider sur une panne d'API.
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FICHIER = os.path.join(RACINE, "avis.json")

NOTES = {"STAR_RATING_UNSPECIFIED": 0, "ONE": 1, "TWO": 2, "THREE": 3, "FOUR": 4, "FIVE": 5}


def demander(url, entetes=None, donnees=None, methode="GET"):
    requete = urllib.request.Request(url, data=donnees, method=methode)
    for cle, valeur in (entetes or {}).items():
        requete.add_header(cle, valeur)
    with urllib.request.urlopen(requete, timeout=30) as reponse:
        return json.loads(reponse.read().decode("utf-8"))


def anciennete(iso):
    """« il y a 3 mois », dans la forme déjà employée par le site."""
    try:
        quand = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return ""
    jours = (datetime.now(timezone.utc) - quand).days
    if jours < 1:
        return "aujourd'hui"
    if jours < 7:
        return "il y a un jour" if jours == 1 else "il y a %d jours" % jours
    if jours < 31:
        semaines = jours // 7
        return "il y a une semaine" if semaines == 1 else "il y a %d semaines" % semaines
    if jours < 365:
        mois = max(1, round(jours / 30.44))
        return "il y a un mois" if mois == 1 else "il y a %d mois" % mois
    ans = max(1, round(jours / 365.25))
    return "il y a un an" if ans == 1 else "il y a %d ans" % ans


# --------------------------------------------------------------------------
# 1. API Business Profile : tous les avis, avec autorisation du propriétaire
# --------------------------------------------------------------------------

def jeton_acces(client_id, secret, rafraichissement):
    corps = urllib.parse.urlencode({
        "client_id": client_id,
        "client_secret": secret,
        "refresh_token": rafraichissement,
        "grant_type": "refresh_token",
    }).encode()
    reponse = demander("https://oauth2.googleapis.com/token",
                       {"Content-Type": "application/x-www-form-urlencoded"},
                       corps, "POST")
    return reponse["access_token"]


def emplacement(jeton, compte_voulu, lieu_voulu):
    """Retrouve « accounts/X » et « locations/Y » si on ne les a pas donnés."""
    if compte_voulu and lieu_voulu:
        return compte_voulu, lieu_voulu
    entetes = {"Authorization": "Bearer " + jeton}
    comptes = demander("https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
                       entetes).get("accounts", [])
    if not comptes:
        raise RuntimeError("aucun compte Business Profile accessible")
    compte = compte_voulu or comptes[0]["name"].split("/")[-1]
    url = ("https://mybusinessbusinessinformation.googleapis.com/v1/accounts/%s/locations"
           "?readMask=name,title&pageSize=100" % compte)
    lieux = demander(url, entetes).get("locations", [])
    if not lieux:
        raise RuntimeError("aucun établissement sur le compte %s" % compte)
    if len(lieux) > 1 and not lieu_voulu:
        sys.stderr.write("Plusieurs établissements ; le premier est retenu : %s\n"
                         % ", ".join(l.get("title", l["name"]) for l in lieux))
    return compte, (lieu_voulu or lieux[0]["name"].split("/")[-1])


def depuis_business_profile():
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    secret = os.environ.get("GOOGLE_CLIENT_SECRET")
    rafraichissement = os.environ.get("GOOGLE_REFRESH_TOKEN")
    if not (client_id and secret and rafraichissement):
        return None

    jeton = jeton_acces(client_id, secret, rafraichissement)
    compte, lieu = emplacement(jeton,
                               os.environ.get("GOOGLE_ACCOUNT_ID"),
                               os.environ.get("GOOGLE_LOCATION_ID"))
    entetes = {"Authorization": "Bearer " + jeton}

    avis, page, total, moyenne = [], None, None, None
    while True:
        url = ("https://mybusiness.googleapis.com/v4/accounts/%s/locations/%s/reviews"
               "?pageSize=50" % (compte, lieu))
        if page:
            url += "&pageToken=" + urllib.parse.quote(page)
        bloc = demander(url, entetes)
        if total is None:
            total = bloc.get("totalReviewCount")
            moyenne = bloc.get("averageRating")
        for brut in bloc.get("reviews", []):
            texte = (brut.get("comment") or "").strip()
            if not texte:
                continue          # un avis sans texte n'a rien à montrer
            avis.append({
                "auteur": (brut.get("reviewer", {}) or {}).get("displayName", "").strip(),
                "date": anciennete(brut.get("createTime", "")),
                "note": NOTES.get(brut.get("starRating"), 0),
                "texte": texte,
            })
        page = bloc.get("nextPageToken")
        if not page:
            break
    return {"avis": avis, "total": total, "moyenne": moyenne, "source": "Business Profile"}


# --------------------------------------------------------------------------
# 2. API Places : cinq avis au plus, mais une simple clé suffit
# --------------------------------------------------------------------------

def depuis_places():
    cle = os.environ.get("GOOGLE_PLACES_API_KEY")
    lieu = os.environ.get("GOOGLE_PLACE_ID")
    if not (cle and lieu):
        return None

    champs = "rating,userRatingCount,reviews"
    url = "https://places.googleapis.com/v1/places/%s?languageCode=fr" % urllib.parse.quote(lieu)
    bloc = demander(url, {"X-Goog-Api-Key": cle, "X-Goog-FieldMask": champs})

    avis = []
    for brut in bloc.get("reviews", []):
        texte = ((brut.get("originalText") or brut.get("text") or {}).get("text") or "").strip()
        if not texte:
            continue
        avis.append({
            "auteur": (brut.get("authorAttribution", {}) or {}).get("displayName", "").strip(),
            "date": brut.get("relativePublishTimeDescription", "")
                    or anciennete(brut.get("publishTime", "")),
            "note": int(brut.get("rating") or 0),
            "texte": texte,
        })
    return {"avis": avis, "total": bloc.get("userRatingCount"),
            "moyenne": bloc.get("rating"), "source": "Places (5 avis au plus)"}


def main():
    ancien = {}
    if os.path.exists(FICHIER):
        with open(FICHIER, encoding="utf-8") as f:
            ancien = json.load(f)

    recolte = None
    configure = False
    for source in (depuis_business_profile, depuis_places):
        try:
            recolte = source()
        except Exception as err:                      # noqa: BLE001
            # une exception veut dire que les identifiants existaient mais
            # que l'appel a échoué : c'est une vraie panne, à signaler.
            configure = True
            sys.stderr.write("%s : %s\n" % (source.__name__, err))
            recolte = None
        if recolte is not None:
            configure = True
        if recolte and recolte["avis"]:
            break

    if not configure:
        # Rien n'est encore branché : ce n'est pas une erreur, on ne veut
        # pas d'une exécution en échec toutes les semaines avant la mise
        # en place des secrets.
        print("Aucun identifiant Google configuré : rien à faire "
              "(voir outils/LISEZMOI-avis.md).")
        return 0

    if not recolte or not recolte["avis"]:
        sys.stderr.write("Aucun avis récupéré : avis.json est laissé tel quel.\n")
        return 1

    nouveau = {
        "lien_google": ancien.get("lien_google", ""),
        "note_moyenne": round(float(recolte["moyenne"]), 1) if recolte["moyenne"]
                        else ancien.get("note_moyenne"),
        "nombre_avis": int(recolte["total"]) if recolte["total"]
                       else ancien.get("nombre_avis"),
        "avis": recolte["avis"],
    }

    if nouveau == ancien:
        print("Aucun changement (%d avis, source %s)." % (len(nouveau["avis"]), recolte["source"]))
        return 0

    with open(FICHIER, "w", encoding="utf-8") as f:
        json.dump(nouveau, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("avis.json mis à jour : %d avis, note %s, total %s (source %s)."
          % (len(nouveau["avis"]), nouveau["note_moyenne"], nouveau["nombre_avis"],
             recolte["source"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
