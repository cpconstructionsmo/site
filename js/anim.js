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

  /* --- 1bis. Menu mobile : le bouton hamburger déplie/replie la nav --- */

  var boutonMenu = document.getElementById('menu-toggle');
  var navPrincipale = document.getElementById('nav-principal');

  if (boutonMenu && navPrincipale) {
    var fermerMenu = function () {
      navPrincipale.classList.remove('ouvert');
      boutonMenu.setAttribute('aria-expanded', 'false');
    };

    boutonMenu.addEventListener('click', function () {
      var ouvert = navPrincipale.classList.toggle('ouvert');
      boutonMenu.setAttribute('aria-expanded', ouvert ? 'true' : 'false');
    });

    // Un lien choisi referme le menu, sinon il reste ouvert par-dessus
    // la page suivante le temps qu'elle s'affiche.
    Array.prototype.forEach.call(navPrincipale.querySelectorAll('a'), function (lien) {
      lien.addEventListener('click', fermerMenu);
    });

    document.addEventListener('click', function (e) {
      if (!navPrincipale.classList.contains('ouvert')) return;
      if (navPrincipale.contains(e.target) || boutonMenu.contains(e.target)) return;
      fermerMenu();
    });

    // Repasser en grand écran (rotation, redimensionnement) ne doit pas
    // laisser le menu ouvert caché derrière la barre redevenue horizontale.
    window.addEventListener('resize', function () {
      if (window.innerWidth > 860) fermerMenu();
    });
  }

  /* --- 2. Diaporama des panneaux du héros ---
     Chaque panneau enchaîne ses diapositives en fondu. Une diapositive
     peut porter une vidéo : on ne la lit que lorsqu'elle est visible,
     pour ne pas faire tourner quatre décodeurs en même temps.

     Sur mobile et en mouvement réduit, les vidéos sont retirées : il
     reste le poster (la photo). Quelques mégaoctets de vidéo sur un
     forfait 4G, pour un fond décoratif, ne se justifient pas. */

  var ecranEtroit = window.matchMedia &&
    window.matchMedia('(max-width: 860px)').matches;

  var sansVideo = ecranEtroit || mouvementReduit;

  var panneaux = document.querySelectorAll('.hero-panneau');

  Array.prototype.forEach.call(panneaux, function (panneau, indexPanneau) {
    var diapos = panneau.querySelectorAll('.diapo');
    if (!diapos.length) return;

    Array.prototype.forEach.call(panneau.querySelectorAll('.diapo-video'),
      function (v) {
        if (sansVideo) {
          // Le poster disparaît avec la balise ; le .jpg du dégradé CSS
          // prend le relais.
          v.remove();
          return;
        }
        // Une source absente ou illisible laisse la place au poster.
        v.addEventListener('error', function () { v.remove(); });
        var src = v.querySelector('source');
        if (src) src.addEventListener('error', function () { v.remove(); });
      });

    // Les deux panneaux démarrent sur des vues différentes, sinon ils
    // affichent la même image côte à côte au chargement.
    var courante = (indexPanneau * 2) % diapos.length;

    var montrer = function (i) {
      Array.prototype.forEach.call(diapos, function (d, j) {
        var actif = (j === i);
        d.classList.toggle('actif', actif);
        var v = d.querySelector('.diapo-video');
        if (!v) return;
        if (actif) {
          var lecture = v.play();
          if (lecture && lecture.catch) lecture.catch(function () {});
        } else {
          v.pause();
        }
      });
    };

    montrer(courante);
    if (diapos.length < 2 || mouvementReduit) return;

    var avancer = function () {
      courante = (courante + 1) % diapos.length;
      montrer(courante);
    };

    // Décalage initial pour que les panneaux ne basculent pas ensemble.
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

  /* --- 4. Avis Google ---
     Les avis vivent dans avis.json, à la racine du site, pour qu'ils
     puissent être mis à jour sans toucher au HTML. Tant que le fichier
     est vide ou illisible, la section reste masquée. */

  var sectionAvis = document.getElementById('avis');

  if (sectionAvis && window.fetch) {
    fetch('avis.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (donnees) {
        if (!donnees || !donnees.avis || !donnees.avis.length) return;
        afficherAvis(donnees);
      })
      .catch(function () { /* section laissée masquée */ });
  }

  function afficherAvis(donnees) {
    var piste = sectionAvis.querySelector('.avis-piste');

    donnees.avis.forEach(function (avis) {
      var carte = document.createElement('article');
      carte.className = 'avis-carte';

      var tete = document.createElement('div');
      tete.className = 'avis-tete';

      var pastille = document.createElement('div');
      pastille.className = 'avis-pastille';
      pastille.textContent = (avis.auteur || '?').trim().charAt(0).toUpperCase();

      var qui = document.createElement('div');
      qui.className = 'avis-qui';
      var nom = document.createElement('div');
      nom.className = 'avis-nom';
      nom.textContent = avis.auteur || '';
      var date = document.createElement('div');
      date.className = 'avis-date';
      date.textContent = avis.date || '';
      qui.appendChild(nom);
      qui.appendChild(date);

      tete.appendChild(pastille);
      tete.appendChild(qui);

      var note = Math.max(0, Math.min(5, parseInt(avis.note, 10) || 0));
      var etoiles = document.createElement('div');
      etoiles.className = 'avis-etoiles';
      etoiles.textContent = '★★★★★'.slice(0, note) + '☆☆☆☆☆'.slice(0, 5 - note);
      etoiles.setAttribute('aria-label', note + ' étoiles sur 5');

      var texte = document.createElement('p');
      texte.className = 'avis-texte';
      // textContent, jamais innerHTML : le contenu est recopié depuis
      // Google, il n'a pas à pouvoir injecter du balisage.
      texte.textContent = avis.texte || '';

      carte.appendChild(tete);
      carte.appendChild(etoiles);
      carte.appendChild(texte);
      piste.appendChild(carte);
    });

    // Note moyenne et volume : c'est ce qui donne du poids aux avis.
    if (donnees.note_moyenne) {
      var resume = sectionAvis.querySelector('.avis-resume');
      var moyenne = Number(donnees.note_moyenne).toFixed(1).replace('.', ',');
      resume.textContent = moyenne + ' sur 5'
        + (donnees.nombre_avis ? ' · ' + donnees.nombre_avis + ' avis Google' : ' sur Google');
      resume.hidden = false;
    }

    if (donnees.lien_google) {
      var lien = sectionAvis.querySelector('.avis-lien');
      lien.href = donnees.lien_google;
      lien.hidden = false;
    }

    // Les flèches ne servent que s'il y a de quoi défiler.
    var fleches = sectionAvis.querySelector('.avis-fleches');
    var defiler = function (sens) {
      var carte = piste.querySelector('.avis-carte');
      piste.scrollBy({ left: sens * (carte.offsetWidth + 20), behavior: 'smooth' });
    };
    fleches.querySelector('[data-sens="-1"]').addEventListener('click', function () { defiler(-1); });
    fleches.querySelector('[data-sens="1"]').addEventListener('click', function () { defiler(1); });

    sectionAvis.hidden = false;   // avant toute mesure : masqué, tout vaut zéro

    var majFleches = function () {
      fleches.hidden = piste.scrollWidth <= piste.clientWidth + 4;
    };
    majFleches();
    window.addEventListener('resize', majFleches, { passive: true });
  }

  /* --- 5. Barres d'avancement des chantiers ---
     La largeur finale est portée par data-avancement ; la barre part de
     zéro et s'y rend une fois le bloc à l'écran. */

  var barres = document.querySelectorAll('.avancement[data-avancement]');

  function remplir(bloc) {
    var pct = Math.max(0, Math.min(100, parseInt(bloc.getAttribute('data-avancement'), 10) || 0));
    var span = bloc.querySelector('.avancement-barre span');
    if (span) span.style.width = pct + '%';
  }

  /* --- 6. Mini-diaporamas des chantiers en cours (page d'accueil) ---
     Même principe que le héros, en plus simple : pas de vidéo, juste un
     fondu entre quelques photos, à son rythme propre par carte pour que
     les vignettes ne changent pas toutes en même temps. */

  var vignettes = document.querySelectorAll('.chantier-teaser-photo');

  Array.prototype.forEach.call(vignettes, function (boite, index) {
    var diapos = boite.querySelectorAll('.mini-diapo');
    if (diapos.length < 2 || mouvementReduit) return;

    var courante = 0;
    window.setTimeout(function () {
      window.setInterval(function () {
        diapos[courante].classList.remove('actif');
        courante = (courante + 1) % diapos.length;
        diapos[courante].classList.add('actif');
      }, 3400);
    }, index * 1200);
  });

  /* --- 7. Apparitions au défilement ---
     Sans IntersectionObserver, ou en mouvement réduit, on ne pose jamais
     la classe .reveal : les contenus restent simplement visibles. */

  if (mouvementReduit || !('IntersectionObserver' in window)) {
    Array.prototype.forEach.call(barres, remplir);
    return;
  }

  var candidats = document.querySelectorAll(
    'section > h2, section > .container > h2, ' +
    '.card, .projet, .chantier, .grid > *, ' +
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
      Array.prototype.forEach.call(
        entree.target.querySelectorAll('.avancement[data-avancement]'), remplir);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

  elements.forEach(function (el) { observateur.observe(el); });
})();
