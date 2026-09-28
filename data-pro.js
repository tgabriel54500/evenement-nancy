// ⚠️ FICHIER GÉNÉRÉ AUTOMATIQUEMENT — ne pas éditer à la main.
// Événements professionnels de Nancy et de ses communes voisines (rayon 5 km).
// Sources : agendas publics des réseaux d'affaires, de la CCI, du MEDEF 54 et
// du Centre Prouvé (voir pro-sources.js / pro-scrape.js).
// Régénérer : node pro-scrape.js && node update-pro.js
// Généré le : 2026-09-28 — 13 événement(s) à venir.

const CATEGORIES = {
  "formation": {
    "label": "Ateliers & formations",
    "emoji": "🛠️"
  },
  "petit-dej": {
    "label": "Petits-déjeuners & déjeuners",
    "emoji": "☕"
  },
  "salon": {
    "label": "Salons & congrès",
    "emoji": "🏛️"
  },
  "conference": {
    "label": "Conférences & tables rondes",
    "emoji": "🎤"
  },
  "afterwork": {
    "label": "Afterworks & networking",
    "emoji": "🥂"
  }
};

const GENERATED_AT = "2026-09-28";

const RESEAUX = [
  {
    "key": "audacieux",
    "name": "Les Audacieux Nancy",
    "site": "https://les-audacieux.fr/",
    "agenda": "https://les-audacieux.fr/afterworks/",
    "blurb": "Club d'entrepreneurs et de commerciaux de la métropole : afterworks et petits-déjeuners ouverts à tous, membres ou curieux.",
    "frequency": "Un rendez-vous par mois environ",
    "membersOnly": false,
    "scrape": true,
    "count": 2
  },
  {
    "key": "cafesbusiness",
    "name": "Les Cafés Business",
    "site": "https://lescafesbusiness.fr/",
    "agenda": "https://lescafesbusiness.fr/nos-evenements-meurthe-moselle/",
    "blurb": "Petits-déjeuners de réseautage accueillis chaque fois par une entreprise différente, sur inscription (places limitées).",
    "frequency": "Deux mardis par mois environ, à 9h",
    "membersOnly": false,
    "scrape": true,
    "count": 3
  },
  {
    "key": "adjan",
    "name": "Le 8/9 d'ADJAN",
    "site": "https://adjan.fr/le-8-9-adjan/",
    "agenda": "https://adjan.fr/le-8-9-adjan/",
    "blurb": "Petits-déjeuners de dirigeants autour d'un intervenant du monde du sport (8h à 9h), sur inscription.",
    "frequency": "Un par mois environ",
    "membersOnly": false,
    "scrape": true,
    "count": 3
  },
  {
    "key": "medef54",
    "name": "MEDEF Meurthe-et-Moselle",
    "site": "https://www.medef-meurthe-moselle.fr/",
    "agenda": "https://www.medef-meurthe-moselle.fr/fr/agenda",
    "blurb": "Soirées Décryptages, Comex40, petits-déjeuners thématiques et formations. Certaines dates sont réservées aux adhérents.",
    "frequency": "Plusieurs rendez-vous par mois",
    "membersOnly": false,
    "scrape": true,
    "count": 0
  },
  {
    "key": "cci",
    "name": "CCI Grand Nancy Métropole",
    "site": "https://www.nancy.cci.fr/",
    "agenda": "https://www.nancy.cci.fr/evenements",
    "blurb": "Réunions d'information, ateliers, Repreneuriales, Nuit de la Création : l'agenda de la chambre de commerce.",
    "frequency": "Plusieurs rendez-vous par mois",
    "membersOnly": false,
    "scrape": true,
    "count": 3
  },
  {
    "key": "prouve",
    "name": "Centre Prouvé & Parc Expo",
    "site": "https://www.destination-nancy.com/organiser-un-evenement-a-nancy/",
    "agenda": "https://www.destination-nancy.com/organiser-un-evenement-a-nancy/agenda-et-actualites/",
    "blurb": "Congrès, journées professionnelles et salons accueillis au centre de congrès et au parc des expositions.",
    "frequency": "Selon le calendrier des congrès",
    "membersOnly": false,
    "scrape": true,
    "count": 2
  },
  {
    "key": "sluc-business",
    "name": "SLUC Business Club",
    "site": "https://sluc-basket.fr/sluc-family/qui-sommes-nous-business-club",
    "agenda": "https://www.facebook.com/p/SLUC-Business-Club-100064875120666/",
    "blurb": "Le club des partenaires du SLUC Nancy Basket : plus de vingt rendez-vous par saison (afterworks, déjeuners, visites d'entreprise), réservés aux membres.",
    "frequency": "Plus de 20 événements par saison",
    "membersOnly": true,
    "scrape": false,
    "count": 0
  },
  {
    "key": "vnvb-business",
    "name": "VNVB Business Club",
    "site": "https://www.vnvb.fr/partenaires/",
    "agenda": "",
    "blurb": "Le réseau des partenaires du Vandœuvre Nancy Volley-Ball : déjeuners mensuels, soirées partenaires, afterworks.",
    "frequency": "Un déjeuner par mois et des soirées",
    "membersOnly": true,
    "scrape": false,
    "count": 0
  },
  {
    "key": "gnvb-business",
    "name": "GNVB, partenaires",
    "site": "https://www.nancy-volley.fr/nos-partenaires/",
    "agenda": "",
    "blurb": "Le club des partenaires du Grand Nancy Volley-Ball, autour des matchs à domicile.",
    "frequency": "",
    "membersOnly": true,
    "scrape": false,
    "count": 0
  },
  {
    "key": "vhb-family-business",
    "name": "Villers Handball, Family Business",
    "site": "https://villers-handball.com/accueil/family-business/les-evenements/",
    "agenda": "",
    "blurb": "Le réseau d'entreprises du Villers Handball : petits-déjeuners, déjeuners business, afterworks et soirées de gala, une vingtaine par saison.",
    "frequency": "Une vingtaine d'événements par saison",
    "membersOnly": true,
    "scrape": false,
    "count": 0
  }
];

const EVENTS = [
  {
    "uuid": "pro-cci-creation-entreprise-identifier-les-points-cles-pour-un-projet-reussi",
    "title": "Création entreprise : identifier les points-clés pour un projet réussi",
    "category": "formation",
    "subcats": [
      "CCI Grand Nancy Métropole",
      "750,00 €",
      "ouvert à tous"
    ],
    "date": "2026-09-28",
    "endDate": "2026-10-02",
    "dateText": "Du 28 au 2 octobre 2026",
    "schedule": "9h00–17h00",
    "place": "",
    "city": "Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-pro/pro-cci-creation-entreprise-identifier-les-points-cles-pour--16hxw7l.svg",
    "url": "https://www.nancy.cci.fr/evenement/creation-entreprise-identifier-les-points-cles-pour-un-projet-reussi",
    "source": "cci",
    "addedAt": "2026-09-28",
    "network": "cci",
    "organizer": "CCI Grand Nancy Métropole",
    "membersOnly": false,
    "price": "750,00 €",
    "description": "La formation pour comprendre comment créer votre entreprise !",
    "autoPoster": true
  },
  {
    "uuid": "pro-cafesbusiness-3374",
    "title": "Café Business chez Combi Events",
    "category": "petit-dej",
    "subcats": [
      "Les Cafés Business",
      "ouvert à tous"
    ],
    "date": "2026-09-29",
    "endDate": "2026-09-29",
    "dateText": "Mardi 29 septembre 2026",
    "schedule": "9h00",
    "place": "Combi Events",
    "city": "Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-pro/pro-cafesbusiness-3374-2026-09-29-1ybua20.svg",
    "url": "https://lescafesbusiness.businessapp.fr/meetings/view/3374",
    "source": "cafesbusiness",
    "addedAt": "2026-09-28",
    "network": "cafesbusiness",
    "organizer": "Les Cafés Business",
    "membersOnly": false,
    "price": "",
    "description": "Petit-déjeuner de réseautage des Cafés Business, accueilli par Combi Events. Inscription en ligne, places limitées.",
    "autoPoster": true
  },
  {
    "uuid": "pro-prouve-2emes-rencontres-du-reseau-velo-et-marche",
    "title": "2èmes Rencontres du Réseau vélo et marche",
    "category": "salon",
    "subcats": [
      "Centre Prouvé & Parc Expo",
      "ouvert à tous"
    ],
    "date": "2026-09-30",
    "endDate": "2026-10-02",
    "dateText": "Du 30 au 2 octobre 2026",
    "schedule": "",
    "place": "Centre Prouvé",
    "city": "Nancy",
    "free": false,
    "reservation": true,
    "image": "https://www.destination-nancy.com/app/uploads/iris-images/25409/rencontres-velo-2026-800x500-f50_50.webp",
    "url": "https://www.destination-nancy.com/temps-fort/2emes-rencontres-du-reseau-velo-et-marche/",
    "source": "prouve",
    "addedAt": "2026-09-28",
    "network": "prouve",
    "organizer": "Centre Prouvé & Parc Expo",
    "membersOnly": false,
    "price": "",
    "description": "Cette année, les 2èmes Rencontres du Réseau vélo et marche se tiendront du 30 septembre au 02 octobre 2026 au Centre Prouvé de Nancy. L’événement de référence qui réunit l’ensemble de l’écosystème français des mobilités actives."
  },
  {
    "uuid": "pro-audacieux-petit-dej-audacieux-b-coworker-nancy-2026-10-01",
    "title": "Petit déj Audacieux – B’CoWorker Nancy",
    "category": "petit-dej",
    "subcats": [
      "Les Audacieux Nancy",
      "ouvert à tous"
    ],
    "date": "2026-10-01",
    "endDate": "2026-10-01",
    "dateText": "Jeudi 1 octobre 2026",
    "schedule": "8h30",
    "place": "B'CoWorker Nancy",
    "city": "Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-pro/pro-audacieux-petit-dej-audacieux-b-coworker-nancy-2026-10-0-18bmycn.svg",
    "url": "https://adsum.social/e/petit-dej-audacieux-b-coworker-nancy",
    "source": "audacieux",
    "addedAt": "2026-09-28",
    "network": "audacieux",
    "organizer": "Les Audacieux Nancy",
    "membersOnly": false,
    "price": "",
    "description": "Comme toujours, l’objectif est simple : se rencontrer, échanger et créer des opportunités business dans une ambiance détendue et bienveillante. Le déroulement du petit dej : 8h30 – Accueil des participants. 9h00 – Mot de bienvenue et présentation du B’cowoker Nancy Tour de table et networking.",
    "autoPoster": true
  },
  {
    "uuid": "pro-adjan-2026-10-06-marc-madiot",
    "title": "8/9 ADJAN avec Marc Madiot",
    "category": "petit-dej",
    "subcats": [
      "Le 8/9 d'ADJAN",
      "ouvert à tous"
    ],
    "date": "2026-10-06",
    "endDate": "2026-10-06",
    "dateText": "Mardi 6 octobre 2026",
    "schedule": "8h00–9h00",
    "place": "Campanile Nancy Gare",
    "city": "Nancy",
    "free": false,
    "reservation": true,
    "image": "https://adjan.fr/wp-content/uploads/2026/09/Marc-MADIOT-nancy.png",
    "url": "https://2ed8yt.share-eu1.hsforms.com/2i3X8dmXOQ-abQhQf-Zc7mg",
    "source": "adjan",
    "addedAt": "2026-09-28",
    "network": "adjan",
    "organizer": "Le 8/9 d'ADJAN",
    "membersOnly": false,
    "price": "",
    "description": "Petit-déjeuner de dirigeants du réseau 8/9 d'ADJAN, de 8h à 9h, avec Marc MADIOT comme intervenant."
  },
  {
    "uuid": "pro-cci-nuit-de-la-creation-2026",
    "title": "LA NUIT DE LA CRÉATION",
    "category": "conference",
    "subcats": [
      "CCI Grand Nancy Métropole",
      "ouvert à tous"
    ],
    "date": "2026-10-08",
    "endDate": "2026-10-08",
    "dateText": "Jeudi 8 octobre 2026",
    "schedule": "16h00–21h00",
    "place": "Pala V - 5 rue du Mouzon",
    "city": "Laxou",
    "free": true,
    "reservation": true,
    "image": "affiches-pro/pro-cci-nuit-de-la-creation-2026-2026-10-08-156juje.svg",
    "url": "https://www.nancy.cci.fr/evenement/nuit-de-la-creation-2026",
    "source": "cci",
    "addedAt": "2026-09-28",
    "network": "cci",
    "organizer": "CCI Grand Nancy Métropole",
    "membersOnly": false,
    "price": "",
    "description": "Rendez-vous le jeudi 8 octobre de 16h à 21h pour la Nuit de la Création d'entreprise !",
    "autoPoster": true
  },
  {
    "uuid": "pro-cafesbusiness-3431",
    "title": "Café Business chez Fenêtres Nancéiennes",
    "category": "petit-dej",
    "subcats": [
      "Les Cafés Business",
      "ouvert à tous"
    ],
    "date": "2026-10-13",
    "endDate": "2026-10-13",
    "dateText": "Mardi 13 octobre 2026",
    "schedule": "9h00",
    "place": "Fenêtres Nancéiennes",
    "city": "Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-pro/pro-cafesbusiness-3431-2026-10-13-3yawh7.svg",
    "url": "https://lescafesbusiness.businessapp.fr/meetings/view/3431",
    "source": "cafesbusiness",
    "addedAt": "2026-09-28",
    "network": "cafesbusiness",
    "organizer": "Les Cafés Business",
    "membersOnly": false,
    "price": "",
    "description": "Petit-déjeuner de réseautage des Cafés Business, accueilli par Fenêtres Nancéiennes. Inscription en ligne, places limitées.",
    "autoPoster": true
  },
  {
    "uuid": "pro-prouve-congres-et-salon-des-epl",
    "title": "Congrès et Salon des Epl",
    "category": "salon",
    "subcats": [
      "Centre Prouvé & Parc Expo",
      "ouvert à tous"
    ],
    "date": "2026-10-14",
    "endDate": "2026-10-16",
    "dateText": "Du 14 au 16 octobre 2026",
    "schedule": "",
    "place": "Centre Prouvé",
    "city": "Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-pro/pro-prouve-congres-et-salon-des-epl-2026-10-14-1dyly9u.svg",
    "url": "https://www.destination-nancy.com/temps-fort/congres-et-salon-des-epl/",
    "source": "prouve",
    "addedAt": "2026-09-28",
    "network": "prouve",
    "organizer": "Centre Prouvé & Parc Expo",
    "membersOnly": false,
    "price": "",
    "description": "Le rendez-vous annuel des entreprises publiques locales.",
    "autoPoster": true
  },
  {
    "uuid": "pro-adjan-2026-11-03-luc-alphand",
    "title": "8/9 ADJAN avec Luc Alphand",
    "category": "petit-dej",
    "subcats": [
      "Le 8/9 d'ADJAN",
      "ouvert à tous"
    ],
    "date": "2026-11-03",
    "endDate": "2026-11-03",
    "dateText": "Mardi 3 novembre 2026",
    "schedule": "8h00–9h00",
    "place": "Nancy (lieu précisé à l'inscription)",
    "city": "Nancy",
    "free": false,
    "reservation": true,
    "image": "https://adjan.fr/wp-content/uploads/2026/09/Luc-ALPHAND.png",
    "url": "https://2ed8yt.share-eu1.hsforms.com/2i3X8dmXOQ-abQhQf-Zc7mg",
    "source": "adjan",
    "addedAt": "2026-09-28",
    "network": "adjan",
    "organizer": "Le 8/9 d'ADJAN",
    "membersOnly": false,
    "price": "",
    "description": "Petit-déjeuner de dirigeants du réseau 8/9 d'ADJAN, de 8h à 9h, avec Luc ALPHAND comme intervenant."
  },
  {
    "uuid": "pro-adjan-2026-11-17-equicoaching",
    "title": "8/9 ADJAN avec EquiCoaching",
    "category": "petit-dej",
    "subcats": [
      "Le 8/9 d'ADJAN",
      "ouvert à tous"
    ],
    "date": "2026-11-17",
    "endDate": "2026-11-17",
    "dateText": "Mardi 17 novembre 2026",
    "schedule": "8h00–9h00",
    "place": "Nancy (lieu précisé à l'inscription)",
    "city": "Nancy",
    "free": false,
    "reservation": true,
    "image": "https://adjan.fr/wp-content/uploads/2026/09/EquiCoaching.png",
    "url": "https://2ed8yt.share-eu1.hsforms.com/2i3X8dmXOQ-abQhQf-Zc7mg",
    "source": "adjan",
    "addedAt": "2026-09-28",
    "network": "adjan",
    "organizer": "Le 8/9 d'ADJAN",
    "membersOnly": false,
    "price": "",
    "description": "Petit-déjeuner de dirigeants du réseau 8/9 d'ADJAN, de 8h à 9h, avec EquiCoaching comme intervenant."
  },
  {
    "uuid": "pro-cafesbusiness-3500",
    "title": "Café Business chez Office Station",
    "category": "petit-dej",
    "subcats": [
      "Les Cafés Business",
      "ouvert à tous"
    ],
    "date": "2026-12-08",
    "endDate": "2026-12-08",
    "dateText": "Mardi 8 décembre 2026",
    "schedule": "9h00",
    "place": "Office Station",
    "city": "Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-pro/pro-cafesbusiness-3500-2026-12-08-80jjnw.svg",
    "url": "https://lescafesbusiness.businessapp.fr/meetings/view/3500",
    "source": "cafesbusiness",
    "addedAt": "2026-09-28",
    "network": "cafesbusiness",
    "organizer": "Les Cafés Business",
    "membersOnly": false,
    "price": "",
    "description": "Petit-déjeuner de réseautage des Cafés Business, accueilli par Office Station. Inscription en ligne, places limitées.",
    "autoPoster": true
  },
  {
    "uuid": "pro-cci-reunion-dinformation-pret-vous-lancer-2",
    "title": "Réunion d’information « Prêt à vous lancer »",
    "category": "formation",
    "subcats": [
      "CCI Grand Nancy Métropole",
      "ouvert à tous"
    ],
    "date": "2026-12-08",
    "endDate": "2026-12-08",
    "dateText": "Mardi 8 décembre 2026",
    "schedule": "9h30–11h30",
    "place": "",
    "city": "Nancy",
    "free": true,
    "reservation": true,
    "image": "affiches-pro/pro-cci-reunion-dinformation-pret-vous-lancer-2-2026-12-08-exrcm7.svg",
    "url": "https://www.nancy.cci.fr/evenement/reunion-dinformation-pret-vous-lancer-2",
    "source": "cci",
    "addedAt": "2026-09-28",
    "network": "cci",
    "organizer": "CCI Grand Nancy Métropole",
    "membersOnly": false,
    "price": "",
    "description": "Vous avez une idée de création d’entreprise mais vous ne savez pas par où commencer ?",
    "autoPoster": true
  },
  {
    "uuid": "pro-audacieux-gan-patrimoine-2027-04-22",
    "title": "Gan Patrimoine",
    "category": "afterwork",
    "subcats": [
      "Les Audacieux Nancy",
      "20€",
      "ouvert à tous"
    ],
    "date": "2027-04-22",
    "endDate": "2027-04-22",
    "dateText": "Jeudi 22 avril 2027",
    "schedule": "19h00",
    "place": "7 All. de la Forêt de la Reine, 54500 Vandœuvre-lès-Nancy",
    "city": "Vandœuvre-lès-Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-pro/pro-audacieux-gan-patrimoine-2027-04-22-2027-04-22-bz6u3s.svg",
    "url": "https://les-audacieux.fr/afterworks/",
    "source": "audacieux",
    "addedAt": "2026-09-28",
    "network": "audacieux",
    "organizer": "Les Audacieux Nancy",
    "membersOnly": false,
    "price": "20€",
    "description": "Mercredi 22 avril à 19h Gan Patrimoine, Vandoeuvre-lès-Nancy Entrée + restauration : Non membre 20€/ Membre 15€ règlement sur place en CB On te donne rendez-vous pour une nouvelle soirée conviviale de networking !",
    "autoPoster": true
  }
];
