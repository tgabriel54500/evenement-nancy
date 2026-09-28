// ⚠️ FICHIER GÉNÉRÉ AUTOMATIQUEMENT — ne pas éditer à la main.
// Rencontres des clubs de haut niveau du Grand Nancy, à domicile uniquement.
// Sources : sites officiels des clubs et des ligues (voir sport-scrape.js).
// Régénérer : node sport-scrape.js && node update-sport.js
// Généré le : 2026-09-28 — 57 rencontre(s) à venir.

const CATEGORIES = {
  "basket": {
    "label": "Basket",
    "emoji": "🏀"
  },
  "volley": {
    "label": "Volley",
    "emoji": "🏐"
  },
  "foot": {
    "label": "Football",
    "emoji": "⚽"
  }
};

const GENERATED_AT = "2026-09-28";

const EVENTS = [
  {
    "uuid": "sport-sluc-j2",
    "title": "SLUC - Cholet Basket",
    "category": "basket",
    "subcats": [
      "SLUC Nancy Basket",
      "Cholet Basket",
      "Betclic ÉLITE"
    ],
    "date": "2026-10-03",
    "endDate": "2026-10-03",
    "dateText": "Samedi 3 octobre 2026",
    "schedule": "",
    "place": "Palais des Sports Jean Weille",
    "city": "Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-sluc-j2.svg",
    "url": "https://coupedefrance.ffbb.com/masculin/equipe/calendrier/15-nancy",
    "addedAt": "2026-09-06"
  },
  {
    "uuid": "sport-vnvb-636443",
    "title": "VNVB - Bordeaux F",
    "category": "volley",
    "subcats": [
      "Vandœuvre Nancy Volley-Ball",
      "Bordeaux F",
      "Saforelle Power 6"
    ],
    "date": "2026-10-03",
    "endDate": "2026-10-03",
    "dateText": "Samedi 3 octobre 2026",
    "schedule": "19h30",
    "place": "Parc des Sports des Nations",
    "city": "Vandœuvre-lès-Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-vnvb-636443.svg",
    "url": "https://www.vnvb.fr/billetterie/",
    "addedAt": "2026-09-18"
  },
  {
    "uuid": "sport-asnl-633125",
    "title": "ASNL - En Avant Guingamp",
    "category": "foot",
    "subcats": [
      "AS Nancy-Lorraine",
      "En Avant Guingamp",
      "Ligue 2 BKT"
    ],
    "date": "2026-10-09",
    "endDate": "2026-10-09",
    "dateText": "Vendredi 9 octobre 2026",
    "schedule": "20h00",
    "place": "Stade Marcel-Picot",
    "city": "Tomblaine",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-asnl-633125.svg",
    "url": "http://asnlbillets.net/Pages/Start.aspx",
    "addedAt": "2026-09-18"
  },
  {
    "uuid": "sport-vnvb-636445",
    "title": "VNVB - Évreux VB",
    "category": "volley",
    "subcats": [
      "Vandœuvre Nancy Volley-Ball",
      "Évreux VB",
      "Saforelle Power 6"
    ],
    "date": "2026-10-13",
    "endDate": "2026-10-13",
    "dateText": "Mardi 13 octobre 2026",
    "schedule": "18h00",
    "place": "Parc des Sports des Nations",
    "city": "Vandœuvre-lès-Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-vnvb-636445.svg",
    "url": "https://www.vnvb.fr/billetterie/",
    "addedAt": "2026-09-18"
  },
  {
    "uuid": "sport-sluc-j4",
    "title": "SLUC - Nanterre 92",
    "category": "basket",
    "subcats": [
      "SLUC Nancy Basket",
      "Nanterre 92",
      "Betclic ÉLITE"
    ],
    "date": "2026-10-17",
    "endDate": "2026-10-17",
    "dateText": "Samedi 17 octobre 2026",
    "schedule": "",
    "place": "Palais des Sports Jean Weille",
    "city": "Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-sluc-j4.svg",
    "url": "https://coupedefrance.ffbb.com/masculin/equipe/calendrier/15-nancy",
    "addedAt": "2026-09-06"
  },
  {
    "uuid": "sport-gnvb-9960",
    "title": "GNVB - Chalon",
    "category": "volley",
    "subcats": [
      "Grand Nancy Volley-Ball",
      "Chalon",
      "Ligue B Masculine"
    ],
    "date": "2026-10-20",
    "endDate": "2026-10-20",
    "dateText": "Mardi 20 octobre 2026",
    "schedule": "20h00",
    "place": "Parc des Sports des Nations",
    "city": "Vandœuvre-lès-Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-gnvb-9960.svg",
    "url": "https://www.nancy-volley.fr/billetterie/",
    "addedAt": "2026-09-08"
  },
  {
    "uuid": "sport-asnl-633127",
    "title": "ASNL - Stade Lavallois Mayenne FC",
    "category": "foot",
    "subcats": [
      "AS Nancy-Lorraine",
      "Stade Lavallois Mayenne FC",
      "Ligue 2 BKT"
    ],
    "date": "2026-10-23",
    "endDate": "2026-10-23",
    "dateText": "Vendredi 23 octobre 2026",
    "schedule": "20h00",
    "place": "Stade Marcel-Picot",
    "city": "Tomblaine",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-asnl-633127.svg",
    "url": "http://asnlbillets.net/Pages/Start.aspx",
    "addedAt": "2026-09-18"
  },
  {
    "uuid": "sport-vnvb-636447",
    "title": "VNVB - Cannes RC",
    "category": "volley",
    "subcats": [
      "Vandœuvre Nancy Volley-Ball",
      "Cannes RC",
      "Saforelle Power 6"
    ],
    "date": "2026-10-24",
    "endDate": "2026-10-24",
    "dateText": "Samedi 24 octobre 2026",
    "schedule": "19h30",
    "place": "Parc des Sports des Nations",
    "city": "Vandœuvre-lès-Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-vnvb-636447.svg",
    "url": "https://www.vnvb.fr/billetterie/",
    "addedAt": "2026-09-18"
  },
  {
    "uuid": "sport-gnvb-10032",
    "title": "GNVB - Saint-Quentin",
    "category": "volley",
    "subcats": [
      "Grand Nancy Volley-Ball",
      "Saint-Quentin",
      "Ligue B Masculine"
    ],
    "date": "2026-10-31",
    "endDate": "2026-10-31",
    "dateText": "Samedi 31 octobre 2026",
    "schedule": "19h00",
    "place": "Parc des Sports des Nations",
    "city": "Vandœuvre-lès-Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-gnvb-10032.svg",
    "url": "https://www.nancy-volley.fr/billetterie/",
    "addedAt": "2026-09-08"
  },
  {
    "uuid": "sport-asnl-633129",
    "title": "ASNL - FC Sochaux Montbéliard",
    "category": "foot",
    "subcats": [
      "AS Nancy-Lorraine",
      "FC Sochaux Montbéliard",
      "Ligue 2 BKT"
    ],
    "date": "2026-11-06",
    "endDate": "2026-11-06",
    "dateText": "Vendredi 6 novembre 2026",
    "schedule": "20h00",
    "place": "Stade Marcel-Picot",
    "city": "Tomblaine",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-asnl-633129.svg",
    "url": "http://asnlbillets.net/Pages/Start.aspx",
    "addedAt": "2026-09-18"
  },
  {
    "uuid": "sport-sluc-j7",
    "title": "SLUC - Limoges CSP",
    "category": "basket",
    "subcats": [
      "SLUC Nancy Basket",
      "Limoges CSP",
      "Betclic ÉLITE"
    ],
    "date": "2026-11-07",
    "endDate": "2026-11-07",
    "dateText": "Samedi 7 novembre 2026",
    "schedule": "",
    "place": "Palais des Sports Jean Weille",
    "city": "Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-sluc-j7.svg",
    "url": "https://coupedefrance.ffbb.com/masculin/equipe/calendrier/15-nancy",
    "addedAt": "2026-09-06"
  },
  {
    "uuid": "sport-vnvb-636449",
    "title": "VNVB - VBC Chamalières",
    "category": "volley",
    "subcats": [
      "Vandœuvre Nancy Volley-Ball",
      "VBC Chamalières",
      "Saforelle Power 6"
    ],
    "date": "2026-11-07",
    "endDate": "2026-11-07",
    "dateText": "Samedi 7 novembre 2026",
    "schedule": "19h30",
    "place": "Parc des Sports des Nations",
    "city": "Vandœuvre-lès-Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-vnvb-636449.svg",
    "url": "https://www.vnvb.fr/billetterie/",
    "addedAt": "2026-09-18"
  },
  {
    "uuid": "sport-gnvb-10019",
    "title": "GNVB - Reims",
    "category": "volley",
    "subcats": [
      "Grand Nancy Volley-Ball",
      "Reims",
      "Ligue B Masculine"
    ],
    "date": "2026-11-14",
    "endDate": "2026-11-14",
    "dateText": "Samedi 14 novembre 2026",
    "schedule": "19h00",
    "place": "Parc des Sports des Nations",
    "city": "Vandœuvre-lès-Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-gnvb-10019.svg",
    "url": "https://www.nancy-volley.fr/billetterie/",
    "addedAt": "2026-09-08"
  },
  {
    "uuid": "sport-asnl-633130",
    "title": "ASNL - Dijon FCO",
    "category": "foot",
    "subcats": [
      "AS Nancy-Lorraine",
      "Dijon FCO",
      "Ligue 2 BKT"
    ],
    "date": "2026-11-20",
    "endDate": "2026-11-20",
    "dateText": "Vendredi 20 novembre 2026",
    "schedule": "20h00",
    "place": "Stade Marcel-Picot",
    "city": "Tomblaine",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-asnl-633130.svg",
    "url": "http://asnlbillets.net/Pages/Start.aspx",
    "addedAt": "2026-09-18"
  },
  {
    "uuid": "sport-sluc-j9",
    "title": "SLUC - Pau-Lacq-Orthez",
    "category": "basket",
    "subcats": [
      "SLUC Nancy Basket",
      "Pau-Lacq-Orthez",
      "Betclic ÉLITE"
    ],
    "date": "2026-11-21",
    "endDate": "2026-11-21",
    "dateText": "Samedi 21 novembre 2026",
    "schedule": "",
    "place": "Palais des Sports Jean Weille",
    "city": "Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-sluc-j9.svg",
    "url": "https://coupedefrance.ffbb.com/masculin/equipe/calendrier/15-nancy",
    "addedAt": "2026-09-06"
  },
  {
    "uuid": "sport-vnvb-636451",
    "title": "VNVB - Béziers VB",
    "category": "volley",
    "subcats": [
      "Vandœuvre Nancy Volley-Ball",
      "Béziers VB",
      "Saforelle Power 6"
    ],
    "date": "2026-11-21",
    "endDate": "2026-11-21",
    "dateText": "Samedi 21 novembre 2026",
    "schedule": "19h30",
    "place": "Parc des Sports des Nations",
    "city": "Vandœuvre-lès-Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-vnvb-636451.svg",
    "url": "https://www.vnvb.fr/billetterie/",
    "addedAt": "2026-09-18"
  },
  {
    "uuid": "sport-gnvb-10007",
    "title": "GNVB - Martigues",
    "category": "volley",
    "subcats": [
      "Grand Nancy Volley-Ball",
      "Martigues",
      "Ligue B Masculine"
    ],
    "date": "2026-11-28",
    "endDate": "2026-11-28",
    "dateText": "Samedi 28 novembre 2026",
    "schedule": "19h00",
    "place": "Parc des Sports des Nations",
    "city": "Vandœuvre-lès-Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-gnvb-10007.svg",
    "url": "https://www.nancy-volley.fr/billetterie/",
    "addedAt": "2026-09-08"
  },
  {
    "uuid": "sport-gnvb-9995",
    "title": "GNVB - France Avenir",
    "category": "volley",
    "subcats": [
      "Grand Nancy Volley-Ball",
      "France Avenir",
      "Ligue B Masculine"
    ],
    "date": "2026-12-11",
    "endDate": "2026-12-11",
    "dateText": "Vendredi 11 décembre 2026",
    "schedule": "20h00",
    "place": "Parc des Sports des Nations",
    "city": "Vandœuvre-lès-Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-gnvb-9995.svg",
    "url": "https://www.nancy-volley.fr/billetterie/",
    "addedAt": "2026-09-08"
  },
  {
    "uuid": "sport-asnl-633132",
    "title": "ASNL - Clermont Foot 63",
    "category": "foot",
    "subcats": [
      "AS Nancy-Lorraine",
      "Clermont Foot 63",
      "Ligue 2 BKT"
    ],
    "date": "2026-12-11",
    "endDate": "2026-12-11",
    "dateText": "Vendredi 11 décembre 2026",
    "schedule": "20h00",
    "place": "Stade Marcel-Picot",
    "city": "Tomblaine",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-asnl-633132.svg",
    "url": "http://asnlbillets.net/Pages/Start.aspx",
    "addedAt": "2026-09-18"
  },
  {
    "uuid": "sport-sluc-j11",
    "title": "SLUC - Saint-Quentin",
    "category": "basket",
    "subcats": [
      "SLUC Nancy Basket",
      "Saint-Quentin",
      "Betclic ÉLITE"
    ],
    "date": "2026-12-12",
    "endDate": "2026-12-12",
    "dateText": "Samedi 12 décembre 2026",
    "schedule": "",
    "place": "Palais des Sports Jean Weille",
    "city": "Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-sluc-j11.svg",
    "url": "https://coupedefrance.ffbb.com/masculin/equipe/calendrier/15-nancy",
    "addedAt": "2026-09-06"
  },
  {
    "uuid": "sport-vnvb-636454",
    "title": "VNVB - Levallois Paris SC F",
    "category": "volley",
    "subcats": [
      "Vandœuvre Nancy Volley-Ball",
      "Levallois Paris SC F",
      "Saforelle Power 6"
    ],
    "date": "2026-12-13",
    "endDate": "2026-12-13",
    "dateText": "Dimanche 13 décembre 2026",
    "schedule": "16h00",
    "place": "Parc des Sports des Nations",
    "city": "Vandœuvre-lès-Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-vnvb-636454.svg",
    "url": "https://www.vnvb.fr/billetterie/",
    "addedAt": "2026-09-18"
  },
  {
    "uuid": "sport-gnvb-9989",
    "title": "GNVB - Fréjus",
    "category": "volley",
    "subcats": [
      "Grand Nancy Volley-Ball",
      "Fréjus",
      "Ligue B Masculine"
    ],
    "date": "2026-12-19",
    "endDate": "2026-12-19",
    "dateText": "Samedi 19 décembre 2026",
    "schedule": "19h00",
    "place": "Parc des Sports des Nations",
    "city": "Vandœuvre-lès-Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-gnvb-9989.svg",
    "url": "https://www.nancy-volley.fr/billetterie/",
    "addedAt": "2026-09-08"
  },
  {
    "uuid": "sport-sluc-j13",
    "title": "SLUC - Bourg-en-Bresse",
    "category": "basket",
    "subcats": [
      "SLUC Nancy Basket",
      "Bourg-en-Bresse",
      "Betclic ÉLITE"
    ],
    "date": "2026-12-22",
    "endDate": "2026-12-22",
    "dateText": "Mardi 22 décembre 2026",
    "schedule": "",
    "place": "Palais des Sports Jean Weille",
    "city": "Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-sluc-j13.svg",
    "url": "https://coupedefrance.ffbb.com/masculin/equipe/calendrier/15-nancy",
    "addedAt": "2026-09-06"
  },
  {
    "uuid": "sport-gnvb-9983",
    "title": "GNVB - Cambrai",
    "category": "volley",
    "subcats": [
      "Grand Nancy Volley-Ball",
      "Cambrai",
      "Ligue B Masculine"
    ],
    "date": "2026-12-22",
    "endDate": "2026-12-22",
    "dateText": "Mardi 22 décembre 2026",
    "schedule": "20h00",
    "place": "Parc des Sports des Nations",
    "city": "Vandœuvre-lès-Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-gnvb-9983.svg",
    "url": "https://www.nancy-volley.fr/billetterie/",
    "addedAt": "2026-09-08"
  },
  {
    "uuid": "sport-vnvb-636457",
    "title": "VNVB - Volley Mulhouse Alsace",
    "category": "volley",
    "subcats": [
      "Vandœuvre Nancy Volley-Ball",
      "Volley Mulhouse Alsace",
      "Saforelle Power 6"
    ],
    "date": "2026-12-30",
    "endDate": "2026-12-30",
    "dateText": "Mercredi 30 décembre 2026",
    "schedule": "19h30",
    "place": "Parc des Sports des Nations",
    "city": "Vandœuvre-lès-Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-vnvb-636457.svg",
    "url": "https://www.vnvb.fr/billetterie/",
    "addedAt": "2026-09-18"
  },
  {
    "uuid": "sport-sluc-j15",
    "title": "SLUC - Le Mans",
    "category": "basket",
    "subcats": [
      "SLUC Nancy Basket",
      "Le Mans",
      "Betclic ÉLITE"
    ],
    "date": "2027-01-09",
    "endDate": "2027-01-09",
    "dateText": "Samedi 9 janvier 2027",
    "schedule": "",
    "place": "Palais des Sports Jean Weille",
    "city": "Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-sluc-j15.svg",
    "url": "https://coupedefrance.ffbb.com/masculin/equipe/calendrier/15-nancy",
    "addedAt": "2026-09-06"
  },
  {
    "uuid": "sport-gnvb-9965",
    "title": "GNVB - Ajaccio",
    "category": "volley",
    "subcats": [
      "Grand Nancy Volley-Ball",
      "Ajaccio",
      "Ligue B Masculine"
    ],
    "date": "2027-01-12",
    "endDate": "2027-01-12",
    "dateText": "Mardi 12 janvier 2027",
    "schedule": "20h00",
    "place": "Parc des Sports des Nations",
    "city": "Vandœuvre-lès-Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-gnvb-9965.svg",
    "url": "https://www.nancy-volley.fr/billetterie/",
    "addedAt": "2026-09-08"
  },
  {
    "uuid": "sport-asnl-633134",
    "title": "ASNL - Grenoble Foot 38",
    "category": "foot",
    "subcats": [
      "AS Nancy-Lorraine",
      "Grenoble Foot 38",
      "Ligue 2 BKT"
    ],
    "date": "2027-01-15",
    "endDate": "2027-01-15",
    "dateText": "Vendredi 15 janvier 2027",
    "schedule": "20h00",
    "place": "Stade Marcel-Picot",
    "city": "Tomblaine",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-asnl-633134.svg",
    "url": "http://asnlbillets.net/Pages/Start.aspx",
    "addedAt": "2026-09-18"
  },
  {
    "uuid": "sport-vnvb-636459",
    "title": "VNVB - Volero Le Cannet",
    "category": "volley",
    "subcats": [
      "Vandœuvre Nancy Volley-Ball",
      "Volero Le Cannet",
      "Saforelle Power 6"
    ],
    "date": "2027-01-16",
    "endDate": "2027-01-16",
    "dateText": "Samedi 16 janvier 2027",
    "schedule": "19h30",
    "place": "Parc des Sports des Nations",
    "city": "Vandœuvre-lès-Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-vnvb-636459.svg",
    "url": "https://www.vnvb.fr/billetterie/",
    "addedAt": "2026-09-18"
  },
  {
    "uuid": "sport-vnvb-636460",
    "title": "VNVB - Saint-Die F",
    "category": "volley",
    "subcats": [
      "Vandœuvre Nancy Volley-Ball",
      "Saint-Die F",
      "Saforelle Power 6"
    ],
    "date": "2027-01-22",
    "endDate": "2027-01-22",
    "dateText": "Vendredi 22 janvier 2027",
    "schedule": "19h30",
    "place": "Parc des Sports des Nations",
    "city": "Vandœuvre-lès-Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-vnvb-636460.svg",
    "url": "https://www.vnvb.fr/billetterie/",
    "addedAt": "2026-09-18"
  },
  {
    "uuid": "sport-sluc-j17",
    "title": "SLUC - Elan Chalon",
    "category": "basket",
    "subcats": [
      "SLUC Nancy Basket",
      "Elan Chalon",
      "Betclic ÉLITE"
    ],
    "date": "2027-01-23",
    "endDate": "2027-01-23",
    "dateText": "Samedi 23 janvier 2027",
    "schedule": "",
    "place": "Palais des Sports Jean Weille",
    "city": "Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-sluc-j17.svg",
    "url": "https://coupedefrance.ffbb.com/masculin/equipe/calendrier/15-nancy",
    "addedAt": "2026-09-06"
  },
  {
    "uuid": "sport-asnl-633136",
    "title": "ASNL - US Boulogne Côte d'Opale",
    "category": "foot",
    "subcats": [
      "AS Nancy-Lorraine",
      "US Boulogne Côte d'Opale",
      "Ligue 2 BKT"
    ],
    "date": "2027-01-29",
    "endDate": "2027-01-29",
    "dateText": "Vendredi 29 janvier 2027",
    "schedule": "20h00",
    "place": "Stade Marcel-Picot",
    "city": "Tomblaine",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-asnl-633136.svg",
    "url": "http://asnlbillets.net/Pages/Start.aspx",
    "addedAt": "2026-09-18"
  },
  {
    "uuid": "sport-gnvb-10061",
    "title": "GNVB - Saint-Quentin",
    "category": "volley",
    "subcats": [
      "Grand Nancy Volley-Ball",
      "Saint-Quentin",
      "Ligue B Masculine"
    ],
    "date": "2027-02-02",
    "endDate": "2027-02-02",
    "dateText": "Mardi 2 février 2027",
    "schedule": "20h00",
    "place": "Parc des Sports des Nations",
    "city": "Vandœuvre-lès-Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-gnvb-10061.svg",
    "url": "https://www.nancy-volley.fr/billetterie/",
    "addedAt": "2026-09-08"
  },
  {
    "uuid": "sport-gnvb-10066",
    "title": "GNVB - France Avenir",
    "category": "volley",
    "subcats": [
      "Grand Nancy Volley-Ball",
      "France Avenir",
      "Ligue B Masculine"
    ],
    "date": "2027-02-06",
    "endDate": "2027-02-06",
    "dateText": "Samedi 6 février 2027",
    "schedule": "19h00",
    "place": "Parc des Sports des Nations",
    "city": "Vandœuvre-lès-Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-gnvb-10066.svg",
    "url": "https://www.nancy-volley.fr/billetterie/",
    "addedAt": "2026-09-08"
  },
  {
    "uuid": "sport-asnl-633138",
    "title": "ASNL - Red Star FC",
    "category": "foot",
    "subcats": [
      "AS Nancy-Lorraine",
      "Red Star FC",
      "Ligue 2 BKT"
    ],
    "date": "2027-02-12",
    "endDate": "2027-02-12",
    "dateText": "Vendredi 12 février 2027",
    "schedule": "20h00",
    "place": "Stade Marcel-Picot",
    "city": "Tomblaine",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-asnl-633138.svg",
    "url": "http://asnlbillets.net/Pages/Start.aspx",
    "addedAt": "2026-09-18"
  },
  {
    "uuid": "sport-sluc-j20",
    "title": "SLUC - Gravelines-Dunkerque",
    "category": "basket",
    "subcats": [
      "SLUC Nancy Basket",
      "Gravelines-Dunkerque",
      "Betclic ÉLITE"
    ],
    "date": "2027-02-13",
    "endDate": "2027-02-13",
    "dateText": "Samedi 13 février 2027",
    "schedule": "",
    "place": "Palais des Sports Jean Weille",
    "city": "Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-sluc-j20.svg",
    "url": "https://coupedefrance.ffbb.com/masculin/equipe/calendrier/15-nancy",
    "addedAt": "2026-09-06"
  },
  {
    "uuid": "sport-vnvb-636463",
    "title": "VNVB - Terville Florange Olympique",
    "category": "volley",
    "subcats": [
      "Vandœuvre Nancy Volley-Ball",
      "Terville Florange Olympique",
      "Saforelle Power 6"
    ],
    "date": "2027-02-13",
    "endDate": "2027-02-13",
    "dateText": "Samedi 13 février 2027",
    "schedule": "19h30",
    "place": "Parc des Sports des Nations",
    "city": "Vandœuvre-lès-Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-vnvb-636463.svg",
    "url": "https://www.vnvb.fr/billetterie/",
    "addedAt": "2026-09-18"
  },
  {
    "uuid": "sport-gnvb-10085",
    "title": "GNVB - Fréjus",
    "category": "volley",
    "subcats": [
      "Grand Nancy Volley-Ball",
      "Fréjus",
      "Ligue B Masculine"
    ],
    "date": "2027-02-27",
    "endDate": "2027-02-27",
    "dateText": "Samedi 27 février 2027",
    "schedule": "19h00",
    "place": "Parc des Sports des Nations",
    "city": "Vandœuvre-lès-Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-gnvb-10085.svg",
    "url": "https://www.nancy-volley.fr/billetterie/",
    "addedAt": "2026-09-08"
  },
  {
    "uuid": "sport-vnvb-636465",
    "title": "VNVB - Neptunes de Nantes VB",
    "category": "volley",
    "subcats": [
      "Vandœuvre Nancy Volley-Ball",
      "Neptunes de Nantes VB",
      "Saforelle Power 6"
    ],
    "date": "2027-02-28",
    "endDate": "2027-02-28",
    "dateText": "Dimanche 28 février 2027",
    "schedule": "16h00",
    "place": "Parc des Sports des Nations",
    "city": "Vandœuvre-lès-Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-vnvb-636465.svg",
    "url": "https://www.vnvb.fr/billetterie/",
    "addedAt": "2026-09-18"
  },
  {
    "uuid": "sport-vnvb-636466",
    "title": "VNVB - France Avenir 2024",
    "category": "volley",
    "subcats": [
      "Vandœuvre Nancy Volley-Ball",
      "France Avenir 2024",
      "Saforelle Power 6"
    ],
    "date": "2027-03-02",
    "endDate": "2027-03-02",
    "dateText": "Mardi 2 mars 2027",
    "schedule": "19h00",
    "place": "Parc des Sports des Nations",
    "city": "Vandœuvre-lès-Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-vnvb-636466.svg",
    "url": "https://www.vnvb.fr/billetterie/",
    "addedAt": "2026-09-18"
  },
  {
    "uuid": "sport-asnl-633141",
    "title": "ASNL - FC Nantes",
    "category": "foot",
    "subcats": [
      "AS Nancy-Lorraine",
      "FC Nantes",
      "Ligue 2 BKT"
    ],
    "date": "2027-03-05",
    "endDate": "2027-03-05",
    "dateText": "Vendredi 5 mars 2027",
    "schedule": "20h00",
    "place": "Stade Marcel-Picot",
    "city": "Tomblaine",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-asnl-633141.svg",
    "url": "http://asnlbillets.net/Pages/Start.aspx",
    "addedAt": "2026-09-18"
  },
  {
    "uuid": "sport-gnvb-10090",
    "title": "GNVB - Reims",
    "category": "volley",
    "subcats": [
      "Grand Nancy Volley-Ball",
      "Reims",
      "Ligue B Masculine"
    ],
    "date": "2027-03-06",
    "endDate": "2027-03-06",
    "dateText": "Samedi 6 mars 2027",
    "schedule": "19h00",
    "place": "Parc des Sports des Nations",
    "city": "Vandœuvre-lès-Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-gnvb-10090.svg",
    "url": "https://www.nancy-volley.fr/billetterie/",
    "addedAt": "2026-09-08"
  },
  {
    "uuid": "sport-asnl-633142",
    "title": "ASNL - Pau FC",
    "category": "foot",
    "subcats": [
      "AS Nancy-Lorraine",
      "Pau FC",
      "Ligue 2 BKT"
    ],
    "date": "2027-03-12",
    "endDate": "2027-03-12",
    "dateText": "Vendredi 12 mars 2027",
    "schedule": "20h00",
    "place": "Stade Marcel-Picot",
    "city": "Tomblaine",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-asnl-633142.svg",
    "url": "http://asnlbillets.net/Pages/Start.aspx",
    "addedAt": "2026-09-18"
  },
  {
    "uuid": "sport-sluc-j22",
    "title": "SLUC - JDA Dijon",
    "category": "basket",
    "subcats": [
      "SLUC Nancy Basket",
      "JDA Dijon",
      "Betclic ÉLITE"
    ],
    "date": "2027-03-13",
    "endDate": "2027-03-13",
    "dateText": "Samedi 13 mars 2027",
    "schedule": "",
    "place": "Palais des Sports Jean Weille",
    "city": "Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-sluc-j22.svg",
    "url": "https://coupedefrance.ffbb.com/masculin/equipe/calendrier/15-nancy",
    "addedAt": "2026-09-06"
  },
  {
    "uuid": "sport-gnvb-10103",
    "title": "GNVB - Harnes",
    "category": "volley",
    "subcats": [
      "Grand Nancy Volley-Ball",
      "Harnes",
      "Ligue B Masculine"
    ],
    "date": "2027-03-20",
    "endDate": "2027-03-20",
    "dateText": "Samedi 20 mars 2027",
    "schedule": "19h00",
    "place": "Parc des Sports des Nations",
    "city": "Vandœuvre-lès-Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-gnvb-10103.svg",
    "url": "https://www.nancy-volley.fr/billetterie/",
    "addedAt": "2026-09-18"
  },
  {
    "uuid": "sport-sluc-j24",
    "title": "SLUC - Chorale Roanne",
    "category": "basket",
    "subcats": [
      "SLUC Nancy Basket",
      "Chorale Roanne",
      "Betclic ÉLITE"
    ],
    "date": "2027-03-27",
    "endDate": "2027-03-27",
    "dateText": "Samedi 27 mars 2027",
    "schedule": "",
    "place": "Palais des Sports Jean Weille",
    "city": "Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-sluc-j24.svg",
    "url": "https://coupedefrance.ffbb.com/masculin/equipe/calendrier/15-nancy",
    "addedAt": "2026-09-06"
  },
  {
    "uuid": "sport-asnl-633144",
    "title": "ASNL - AS Saint-Etienne",
    "category": "foot",
    "subcats": [
      "AS Nancy-Lorraine",
      "AS Saint-Etienne",
      "Ligue 2 BKT"
    ],
    "date": "2027-04-02",
    "endDate": "2027-04-02",
    "dateText": "Vendredi 2 avril 2027",
    "schedule": "20h00",
    "place": "Stade Marcel-Picot",
    "city": "Tomblaine",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-asnl-633144.svg",
    "url": "http://asnlbillets.net/Pages/Start.aspx",
    "addedAt": "2026-09-18"
  },
  {
    "uuid": "sport-sluc-j25",
    "title": "SLUC - Boulazac",
    "category": "basket",
    "subcats": [
      "SLUC Nancy Basket",
      "Boulazac",
      "Betclic ÉLITE"
    ],
    "date": "2027-04-03",
    "endDate": "2027-04-03",
    "dateText": "Samedi 3 avril 2027",
    "schedule": "",
    "place": "Palais des Sports Jean Weille",
    "city": "Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-sluc-j25.svg",
    "url": "https://coupedefrance.ffbb.com/masculin/equipe/calendrier/15-nancy",
    "addedAt": "2026-09-06"
  },
  {
    "uuid": "sport-gnvb-10122",
    "title": "GNVB - Martigues",
    "category": "volley",
    "subcats": [
      "Grand Nancy Volley-Ball",
      "Martigues",
      "Ligue B Masculine"
    ],
    "date": "2027-04-06",
    "endDate": "2027-04-06",
    "dateText": "Mardi 6 avril 2027",
    "schedule": "20h00",
    "place": "Parc des Sports des Nations",
    "city": "Vandœuvre-lès-Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-gnvb-10122.svg",
    "url": "https://www.nancy-volley.fr/billetterie/",
    "addedAt": "2026-09-08"
  },
  {
    "uuid": "sport-gnvb-10126",
    "title": "GNVB - Saint-Jean d'Illac",
    "category": "volley",
    "subcats": [
      "Grand Nancy Volley-Ball",
      "Saint-Jean d'Illac",
      "Ligue B Masculine"
    ],
    "date": "2027-04-10",
    "endDate": "2027-04-10",
    "dateText": "Samedi 10 avril 2027",
    "schedule": "19h00",
    "place": "Parc des Sports des Nations",
    "city": "Vandœuvre-lès-Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-gnvb-10126.svg",
    "url": "https://www.nancy-volley.fr/billetterie/",
    "addedAt": "2026-09-08"
  },
  {
    "uuid": "sport-sluc-j27",
    "title": "SLUC - Strasbourg",
    "category": "basket",
    "subcats": [
      "SLUC Nancy Basket",
      "Strasbourg",
      "Betclic ÉLITE"
    ],
    "date": "2027-04-17",
    "endDate": "2027-04-17",
    "dateText": "Samedi 17 avril 2027",
    "schedule": "",
    "place": "Palais des Sports Jean Weille",
    "city": "Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-sluc-j27.svg",
    "url": "https://coupedefrance.ffbb.com/masculin/equipe/calendrier/15-nancy",
    "addedAt": "2026-09-06"
  },
  {
    "uuid": "sport-gnvb-10133",
    "title": "GNVB - REC Volley-ball",
    "category": "volley",
    "subcats": [
      "Grand Nancy Volley-Ball",
      "REC Volley-ball",
      "Ligue B Masculine"
    ],
    "date": "2027-04-17",
    "endDate": "2027-04-17",
    "dateText": "Samedi 17 avril 2027",
    "schedule": "19h00",
    "place": "Parc des Sports des Nations",
    "city": "Vandœuvre-lès-Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-gnvb-10133.svg",
    "url": "https://www.nancy-volley.fr/billetterie/",
    "addedAt": "2026-09-08"
  },
  {
    "uuid": "sport-asnl-633147",
    "title": "ASNL - FC Annecy",
    "category": "foot",
    "subcats": [
      "AS Nancy-Lorraine",
      "FC Annecy",
      "Ligue 2 BKT"
    ],
    "date": "2027-04-23",
    "endDate": "2027-04-23",
    "dateText": "Vendredi 23 avril 2027",
    "schedule": "20h00",
    "place": "Stade Marcel-Picot",
    "city": "Tomblaine",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-asnl-633147.svg",
    "url": "http://asnlbillets.net/Pages/Start.aspx",
    "addedAt": "2026-09-18"
  },
  {
    "uuid": "sport-sluc-j29",
    "title": "SLUC - LDLC ASVEL",
    "category": "basket",
    "subcats": [
      "SLUC Nancy Basket",
      "LDLC ASVEL",
      "Betclic ÉLITE"
    ],
    "date": "2027-05-01",
    "endDate": "2027-05-01",
    "dateText": "Samedi 1 mai 2027",
    "schedule": "",
    "place": "Palais des Sports Jean Weille",
    "city": "Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-sluc-j29.svg",
    "url": "https://coupedefrance.ffbb.com/masculin/equipe/calendrier/15-nancy",
    "addedAt": "2026-09-06"
  },
  {
    "uuid": "sport-gnvb-10145",
    "title": "GNVB - Chalon",
    "category": "volley",
    "subcats": [
      "Grand Nancy Volley-Ball",
      "Chalon",
      "Ligue B Masculine"
    ],
    "date": "2027-05-02",
    "endDate": "2027-05-02",
    "dateText": "Dimanche 2 mai 2027",
    "schedule": "16h00",
    "place": "Parc des Sports des Nations",
    "city": "Vandœuvre-lès-Nancy",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-gnvb-10145.svg",
    "url": "https://www.nancy-volley.fr/billetterie/",
    "addedAt": "2026-09-08"
  },
  {
    "uuid": "sport-asnl-633149",
    "title": "ASNL - Rodez Aveyron Football",
    "category": "foot",
    "subcats": [
      "AS Nancy-Lorraine",
      "Rodez Aveyron Football",
      "Ligue 2 BKT"
    ],
    "date": "2027-05-07",
    "endDate": "2027-05-07",
    "dateText": "Vendredi 7 mai 2027",
    "schedule": "20h00",
    "place": "Stade Marcel-Picot",
    "city": "Tomblaine",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-asnl-633149.svg",
    "url": "http://asnlbillets.net/Pages/Start.aspx",
    "addedAt": "2026-09-18"
  },
  {
    "uuid": "sport-asnl-633151",
    "title": "ASNL - FC Metz",
    "category": "foot",
    "subcats": [
      "AS Nancy-Lorraine",
      "FC Metz",
      "Ligue 2 BKT"
    ],
    "date": "2027-05-22",
    "endDate": "2027-05-22",
    "dateText": "Samedi 22 mai 2027",
    "schedule": "20h00",
    "place": "Stade Marcel-Picot",
    "city": "Tomblaine",
    "free": false,
    "reservation": true,
    "image": "affiches-sport/sport-asnl-633151.svg",
    "url": "http://asnlbillets.net/Pages/Start.aspx",
    "addedAt": "2026-09-18"
  }
];
