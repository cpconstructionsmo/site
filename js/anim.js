/* Animations du site — diaporama du héros, apparitions au défilement,
   barre de navigation et compteurs chiffrés.
   Tout est optionnel : si ce script ne se charge pas, le site reste
   entièrement lisible et navigable. */

(function () {
  'use strict';

  var mouvementReduit = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* --- 1. Barre de navigation : elle se densifie une fois qu'on défile --- */

  var entete = document.querySelector('header');
  if (entete) {
    var majEntete = function () {
      entete.classList.toggle('detachee', window.scrollY > 12);
    };
    majEntete();
    window.addEventListener('scroll', majEntete, { passive: true });
  }

  /* --- 2. Diaporama des panneaux du héros ---
     Chaque panneau enchaîne ses diapositives en fondu. Les deux panneaux
     sont décalés dans le temps pour ne pas basculer à l'unisson, ce qui
     ferait clignoter toute la page d'un coup. */

  var panneaux = document.querySelectorAll('.hero-panneau');

  Array.prototype.forEach.call(panneaux, function (panneau, indexPanneau) {
    var diapos = panneau.querySelectorAll('.diapo');
    if (!diapos.length) return;

    diapos[0].classList.add('actif');
    if (diapos.length < 2 || mouvementReduit) return;

    var courante = 0;
    var avancer = function () {
      diapos[courante].classList.remove('actif');
      courante = (courante + 1) % diapos.length;
      diapos[courante].classList.add('actif');
    };

    // Décalage initial : le second panneau démarre à contretemps.
    window.setTimeout(function () {
      window.setInterval(avancer, 5200);
    }, indexPanneau * 2600);
  });

  /* --- 3. Compteurs chiffrés ---
     Le nombre final reste écrit dans le HTML : si le script échoue ou si
     l'utilisateur a demandé moins d'animations, la page affiche la bonne
     valeur, pas un zéro. */

  function compter(el) {
    if (el.dataset.compte) return;      // une seule fois
    var cible = parseFloat(el.getAttribute('data-compteur'));
    if (isNaN(cible)) return;
    el.dataset.compte = '1';

    var suffixe = el.getAttribute('data-suffixe') || '';
    var duree = 1100;
    var depart = null;

    function pas(horodatage) {
      if (depart === null) depart = horodatage;
      var avancement = Math.min((horodatage - depart) / duree, 1);
      // Décélération : le chiffre ralentit en approchant de sa valeur.
      var douceur = 1 - Math.pow(1 - avancement, 3);
      el.textContent = Math.round(cible * douceur) + suffixe;
      if (avancement < 1) requestAnimationFrame(pas);
    }

    requestAnimationFrame(pas);
  }

  function compterDans(racine) {
    if (racine.hasAttribute('data-compteur')) compter(racine);
    Array.prototype.forEach.call(
      racine.querySelectorAll('[data-compteur]'), compter);
  }

  /* --- 4. Apparitions au défilement ---
     Sans IntersectionObserver, ou en mouvement réduit, on ne pose jamais
     la classe .reveal : les contenus restent simplement visibles. */

  if (mouvementReduit || !('IntersectionObserver' in window)) return;

  var candidats = document.querySelectorAll(
    'section > h2, section > .container > h2, ' +
    '.card, .projet, .grid > *, ' +
    '.page-detail > section, .page-detail-intro, table'
  );

  // Un élément contenu dans un autre élément animé hériterait déjà de son
  // apparition : on ne garde que les blocs de plus haut niveau, sinon les
  // titres intérieurs apparaissent deux fois.
  var elements = Array.prototype.filter.call(candidats, function (el) {
    for (var p = el.parentElement; p; p = p.parentElement) {
      if (Array.prototype.indexOf.call(candidats, p) !== -1) return false;
    }
    return true;
  });

  if (!elements.length) return;

  elements.forEach(function (el) {
    el.classList.add('reveal');

    // Cascade au sein d'une même grille, plafonnée pour que le dernier
    // élément d'une longue liste n'attende pas indéfiniment.
    var parent = el.parentElement;
    if (parent && parent.classList.contains('grid')) {
      var rang = Array.prototype.indexOf.call(parent.children, el);
      el.setAttribute('data-retard', String(Math.min(rang, 5)));
    }
  });

  var observateur = new IntersectionObserver(function (entrees) {
    entrees.forEach(function (entree) {
      if (!entree.isIntersecting) return;
      entree.target.classList.add('vu');
      observateur.unobserve(entree.target);
      compterDans(entree.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

  elements.forEach(function (el) { observateur.observe(el); });
})();
