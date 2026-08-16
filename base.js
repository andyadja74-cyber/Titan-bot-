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

// 🧠 Banques de données pour la fonctionnalité Cerveau / Mox
const DONNEES_CERVEAU = [
  "🧠 Intelligence",
  "⚡ Vitesse de réflexion",
  "😰 Niveau de stress",
  "🙈 Timidité",
  "🎨 Créativité",
  "🔥 Motivation",
  "😇 Gentillesse",
  "🤡 Côté Clown / Humour",
  "👑 Ego / Fierté",
  "🤫 Capacité à garder un secret"
];

const COMMENTAIRES_CERVEAU = [
  "Un profil équilibré, mais attention à la surchauffe !",
  "Cerveau en mode génie incompris 🧬",
  "Attention, ce cerveau fonctionne à 90% sur du pur chaos 😂",
  "Un esprit brillant et calme sous la pression 💎",
  "Niveau de timidité un peu haut, mais potentiel énorme ! 🚀",
  "Ce cerveau a besoin d'une pause café urgemment ☕"
];

// 🕵️‍♂️ Données pour le mini-jeu Détective Boosté
const DONNEES_DETECTIVE_BOOSTE = {
  suspects: ["Professeur Noir", "Colonel Moutarde", "Mademoiselle Pervenche", "Docteur Olive"],
  lieux: ["Le Salon", "La Bibliothèque", "Le Jardin", "La Cuisine"],
  armes: ["Le Chandelier", "La Dague", "La Clé Anglaise", "Le Revolver"],
  temoignagesFaux: [
    "Quelqu'un a été aperçu près de la bibliothèque avec une arme.",
    "Un bruit suspect a retenti vers minuit.",
    "La porte du jardin était entrouverte pendant le drame."
  ]
};

// 🤫 Message secret d'Andy pour Ashley
const MESSAGE_SECRET_ANDY = `Ahhh ok c'est toi vrm désolé pour la sécurité 🥲

Ashley tu ne sais pas à quel point je suis content 🙂 que tu sois là 😌🤩
T'a mm réussi à déverrouiller le mot de passe🔐 
En vrai c'était facile il a juste demandé ton identité🪪 
Bref je vais aller droit au but😯💨 Andy que tu connais là mais purée il a changé de ouf😵‍💫😢 c'est un OBSÉDÉ 
Je t'assure il est gravé obsédé🧟 en mode obsession niveau max ça veut peter💥 même, mais par qui🧍🏼‍♀️ est il obsédé ? 🧐
Humm... Ashley si tu es en train de lire ce message c'est pas par hasard 🎲
En fait ce message t'étais déjà destiné🔮 en vrai Andy il est obsédé par toi oui toi Ashley 🫵🏼 orhh arrête de regarder à gauche ou à droite je parle bien de toi 🫵🏼 Humm... Il est obsédé par toi tu hantes ses pensées de ouf 😌💭👸🏼👸🏼 et même qu'il est amoureux de toi 😍 il pense que t'es sa reine 👸🏼 son honey 😍 sa copine 👥❤️
Bon c'est ce que je sais ohh faut pas lui dire que je t'ai montré hyn 
Att 2 secondes imagine tu lis ça et toi mm tu le savais déjà ou b lui mm il t'avait déjà dit ça, ça allait être b sur moi hyn 😂 
Heureusement que tu sais pas hyn 😂 enfin je pense 🤔
Pourvu qu'il ne le sache pas ohh 😬`;

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
const sessionsSecretAndy = {};

// ==========================================
// 📤 EXPORTATION VERS INDEX.JS
// ==========================================
module.exports = {
  COMMENTAIRES_LOVE,
  CITATIONS,
  LISTE_ANIMAUX,
  MOTS_SQUID,
  DONNEES_CERVEAU,
  COMMENTAIRES_CERVEAU,
  DONNEES_DETECTIVE_BOOSTE,
  MESSAGE_SECRET_ANDY,
  partiesEnCours,
  timersInactivite,
  vueUniqueCache,
  animauxJoueurs,
  mesNotes,
  sessionsMotDePasse,
  profilsJoueurs,
  membresSalues,
  sessionsSecretAndy
};
