# Envoi des formulaires (contact + simulateur DPE)

Les deux formulaires du site — la demande de devis sur `contact.html` et
« Être contacté(e) par un expert » à la fin du simulateur DPE —
ouvraient jusqu'ici la messagerie du visiteur (`mailto:`) avec le
message pré-rempli. Ça ne marche que si le visiteur a une messagerie
configurée sur l'appareil qu'il utilise : sur beaucoup de téléphones,
rien ne s'ouvre et la demande est perdue sans que personne ne le sache.

Les deux formulaires envoient maintenant leur contenu à
[Web3Forms](https://web3forms.com), un service qui relaie simplement
vers votre boîte mail, gratuitement. **Tant que la clé n'est pas
configurée (ci-dessous), rien ne change : les formulaires continuent
d'ouvrir la messagerie comme avant.** Aucune urgence à agir, mais tant
que ce n'est pas fait, le problème décrit ci-dessus reste entier.

---

## Mise en place (une minute, sans mot de passe)

1. Aller sur <https://web3forms.com/>.
2. Saisir l'adresse qui doit recevoir les demandes
   (`contact@cpconstructions.fr`) et valider.
3. Une clé arrive par email à cette adresse — la copier.
4. Ouvrir `js/formulaires.js` et remplacer la ligne :

   ```js
   var CLE_WEB3FORMS = 'À_REMPLACER_PAR_VOTRE_CLE_WEB3FORMS';
   ```

   par la clé reçue, par exemple :

   ```js
   var CLE_WEB3FORMS = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
   ```

5. Enregistrer, envoyer un message de test depuis `contact.html` en
   conditions réelles pour vérifier qu'il arrive bien par email.

C'est tout : les deux formulaires partagent la même clé, rien d'autre à
configurer.

---

## Ce qui se passe à l'envoi

- **Clé configurée, envoi réussi** — le message est transmis à Web3Forms,
  qui le relaie par email. Le visiteur voit une confirmation sur la page,
  sans la quitter. Le formulaire se vide.
- **Clé configurée, envoi impossible** (connexion coupée, service en
  panne) — le visiteur voit un message d'erreur avec un lien direct pour
  envoyer sa demande par email à la place, plus le numéro de téléphone.
  Rien n'est perdu en silence.
- **Clé non configurée** — comportement inchangé : `mailto:` s'ouvre
  comme avant.

Un champ invisible (« piège à robots », `botcheck`) filtre une partie du
spam automatisé sans gêner un visiteur : il ne le voit ni au clavier ni
à la souris.

## Où sont reçues les demandes

Web3Forms relaie par email à l'adresse indiquée à l'étape 2. Chaque
message porte l'adresse du visiteur en réponse (« Répondre à » pointe
directement vers lui, pas vers Web3Forms) — répondre à l'email suffit
pour le recontacter.

Web3Forms est gratuit sans limite de messages pour un usage normal de ce
type de site. Aucune inscription complexe, aucun mot de passe à retenir :
la clé suffit.
