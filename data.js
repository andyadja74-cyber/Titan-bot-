// ==========================================
// 📦 BANQUES DE DONNÉES STATIQUES & DONNÉES DE JEU
// ==========================================

// 💖 Banque de commentaires pour le test de compatibilité (.love)
const COMMENTAIRES_LOVE = {
  parfait: [
    "C'est l'amour fou ! Une connexion cosmique et indestructible ! 💖✨",
    "Vous êtes faits l'un pour l'autre, mariage direct ! 💍😍",
    "Une alchimie rare, gardez cette flamme intacte ! 🔥"
  ],
  moyen: [
    "Une très bonne entente, mais il faut un peu plus de piment ! 😉",
    "Il y a un bon potentiel, continuez à faire des efforts ! 👍",
    "Pas mal du tout ! La complicité est bien présente. 😊"
  ],
  faible: [
    "Oula... Il va falloir beaucoup de patience et de dialogue ! 😅",
    "Aïe, c'est pas gagné d'avance... Mais l'espoir fait vivre ! 💔",
    "C'est très compliqué, préparez-vous aux secousses ! ⚡"
  ]
};

// 📜 Banque de citations inspirantes (.citation)
const CITATIONS = [
  { c: "La vie est un mystère qu'il faut vivre, non un problème à résoudre.", a: "Gabriel Marcel" },
  { c: "Le plus grand risque est de ne prendre aucun risque.", a: "Mark Zuckerberg" },
  { c: "Il n'y a qu'une façon d'échouer, c'est d'abandonner avant d'avoir réussi.", a: "Georges Clemenceau" },
  { c: "Sois le changement que tu veux voir dans le monde.", a: "Mahatma Gandhi" },
  { c: "La simplicité est la sophistication suprême.", a: "Léonard de Vinci" }
];

// 🐾 Banque d'animaux de compagnie (.animal)
const LISTE_ANIMAUX = [
  { nom: "Lapin Câlin 🐰", type: "Lapin", nourriture: "des carottes 🥕" },
  { nom: "Chat Mignon 🐱", type: "Chat", nourriture: "du poisson 🐟" },
  { nom: "Nounours Douillet 🧸", type: "Nounours", nourriture: "du miel 🍯" },
  { nom: "Chiot Loyal 🐶", type: "Chien", nourriture: "un os 🦴" },
  { nom: "Panda Joueur 🐼", type: "Panda", nourriture: "du bambou 🎋" },
  { nom: "Bébé Dragon 🐲", type: "Dragon", nourriture: "des braises 🔥" }
];

// 🔴 Banque de mots pour Squid Game (.feurouge)
const MOTS_SQUID = [
  "COURIR", "AVANCER", "STOP", "ROUGE", "VERT", 
  "SURVIE", "TITAN", "RAPIDE", "ESQUIVER", "ACCELERER", 
  "INFRAROUGE", "IMMOBILE"
];

// ==========================================
// 🧠 BANQUES DE DONNÉES EN MÉMOIRE (STOCKAGE DYNAMIQUE)
// ==========================================
const partiesEnCours = {};
const timersInactivite = {};
const vueUniqueCache = {};
const animauxJoueurs = {};
const mesNotes = {};
const sessionsMotDePasse = {};
const profilsJoueurs = {};
const membresSalues = new Set();

// ==========================================
// 📤 EXPORTATION VERS INDEX.JS
// ==========================================
module.exports = {
  COMMENTAIRES_LOVE,
  CITATIONS,
  LISTE_ANIMAUX,
  MOTS_SQUID,
  partiesEnCours,
  timersInactivite,
  vueUniqueCache,
  animauxJoueurs,
  mesNotes,
  sessionsMotDePasse,
  profilsJoueurs,
  membresSalues
};
