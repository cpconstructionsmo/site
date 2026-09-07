/* Envoi des formulaires (contact + simulateur DPE) via Web3Forms.

   Tant que la clé ci-dessous n'est pas renseignée, les formulaires
   continuent d'ouvrir un mailto: comme avant : rien ne casse en
   attendant la configuration. Une fois la clé en place, l'envoi se
   fait en arrière-plan, sans quitter la page, avec un message de
   confirmation ou d'échec.

   Pour obtenir la clé (une minute, sans mot de passe) :
     1. https://web3forms.com/
     2. Saisir l'adresse qui doit recevoir les demandes
        (contact@cpconstructions.fr)
     3. La clé arrive par email : la copier ci-dessous.
   Voir outils/LISEZMOI-formulaires.md pour le détail. */

var CLE_WEB3FORMS = '94c548a1-a9c7-427d-a14d-823d4e61e7aa';

(function () {
  'use strict';

  function cleConfiguree() {
    return !!CLE_WEB3FORMS && CLE_WEB3FORMS.indexOf('REMPLACER') === -1;
  }

  function afficherStatut(zone, type, texte) {
    zone.hidden = false;
    zone.className = 'statut-formulaire statut-formulaire-' + type;
    zone.textContent = texte;
    zone.setAttribute('role', type === 'erreur' ? 'alert' : 'status');
  }

  /**
   * Envoie un formulaire à Web3Forms, avec repli sur mailto: si la clé
   * n'est pas configurée ou si l'envoi échoue (réseau coupé, service
   * indisponible...) : la demande n'est jamais perdue en silence.
   *
   * @param {HTMLFormElement} formulaire
   * @param {HTMLButtonElement} bouton
   * @param {HTMLElement} zoneStatut  élément (hidden par défaut) pour le message
   * @param {Object} champs          données à transmettre à Web3Forms
   * @param {string} sujet
   * @param {string} mailtoSecours   lien mailto complet, utilisé en repli
   */
  function envoyerFormulaire(formulaire, bouton, zoneStatut, champs, sujet, mailtoSecours) {
    if (!cleConfiguree()) {
      window.location.href = mailtoSecours;
      return;
    }

    var texteInitial = bouton.textContent;
    bouton.disabled = true;
    bouton.textContent = 'Envoi en cours…';
    zoneStatut.hidden = true;

    var donnees = Object.assign({
      access_key: CLE_WEB3FORMS,
      subject: sujet,
      botcheck: formulaire.querySelector('[name="botcheck"]') ?
        formulaire.querySelector('[name="botcheck"]').checked : false
    }, champs);

    fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(donnees)
    })
      .then(function (reponse) {
        return reponse.json().then(function (corps) {
          return { ok: reponse.ok, corps: corps };
        });
      })
      .then(function (resultat) {
        if (resultat.ok && resultat.corps && resultat.corps.success) {
          afficherStatut(zoneStatut, 'succes',
            'Votre demande a bien été envoyée. Nous revenons vers vous rapidement.');
          formulaire.reset();
        } else {
          throw new Error((resultat.corps && resultat.corps.message) || 'échec de l\'envoi');
        }
      })
      .catch(function () {
        afficherStatut(zoneStatut, 'erreur',
          'L\'envoi a échoué (connexion coupée ou service indisponible). ' +
          'Vous pouvez réessayer, nous appeler au 06 65 67 68 81, ou ');
        var lien = document.createElement('a');
        lien.href = mailtoSecours;
        lien.textContent = 'envoyer votre demande par email';
        zoneStatut.appendChild(lien);
        zoneStatut.appendChild(document.createTextNode('.'));
      })
      .finally(function () {
        bouton.disabled = false;
        bouton.textContent = texteInitial;
      });
  }

  window.envoyerFormulaire = envoyerFormulaire;
})();
