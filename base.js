const { 
  default: makeWASocket, 
  useMultiFileAuthState, 
  DisconnectReason, 
  delay, 
  downloadContentFromMessage 
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const pino = require("pino");
const fs = require("fs");
const path = require("path");
const gTTS = require("gtts");
const ffmpeg = require("fluent-ffmpeg");

// --- IMPORT DICO BACCALAURÉAT DEPUIS BAC.JS ---
const { dictionnaireBaccalaureat } = require("./bac");

// --- IMPORT DICO MANGA DEPUIS MANGA.JS ---
const { dictionnaireAttaquesManga } = require("./manga");

// ==========================================
// ⚙️ CONFIGURATION & PARAMÈTRES GLOBANX
// ==========================================
const NUMERO_BOT = "2250141606159"; 
const NUMERO_CREATEUR = "2250594208423@s.whatsapp.net";

const NOMS_GROUPES_CIBLES = [
  "💦💧 gouttes💧💦",
  "Poussière 😌"
];

// ==========================================
// 🧠 ÉTATS ET MÉMOIRE DU BOT (SESSIONS & JEUX)
// ==========================================
const tempsDerniereActivite = {};
const sniperEnCours = {};
const etapeRoyaume = {};
const bombeEnCours = {};
const etapeSecret = {};
const devineEnCours = {};
const chaineEnCours = {};
const espionPartie = {};
const partieNiOuiNiNon = {};
const partieIntrus = {};
const partieEmoji = {}; 
const partieBaccalaureat = {};
const mariagesVirtuels = {}; 
const karmaMembres = {};     
const inventairesMembres = {}; 
const partieLoupGarou = {};
const partieRouletteRusse = {};
const partieChasseAuTresor = {};
const partieDevineAnimal = {};
const partieDevineCriAnimal = {};
const partieLoupGarouTexte = {};
const partieCadavreExquis = {};
const partiePatateChaude = {};
const partieFauxSMS = {};
const metiersMembres = {};
const partieDactylo = {};
const partieComboEmoji = {};
const sessionsActives = {};
const requêtesEnAttente = {};
const partieManga = {}; // 🟢 MÉMOIRE SESSIONS MANGA

// ==========================================
// 📚 BANQUES DE DONNÉES & DICTIONNAIRES BOOSTÉS
// ==========================================

// --- ÉMOJIS SIMPLE ET COMPLEXE ---
const emojisSimple = [
  { nom: "Rire", emoji: "😂" }, { nom: "Amour", emoji: "❤️" }, { nom: "Feu", emoji: "🔥" },
  { nom: "Chat", emoji: "🐱" }, { nom: "Chien", emoji: "🐶" }, { nom: "Soleil", emoji: "☀️" },
  { nom: "Pizza", emoji: "🍕" }, { nom: "Fusée", emoji: "🚀" }, { nom: "Couronne", emoji: "👑" },
  { nom: "Étoile", emoji: "⭐" }, { nom: "Éclair", emoji: "⚡" }, { nom: "Diamant", emoji: "💎" }
];

const emojisComplexe = [
  { nom: "Licorne", emoji: "🦄" }, { nom: "Fantôme", emoji: "👻" }, { nom: "Alien", emoji: "👽" },
  { nom: "Robot", emoji: "🤖" }, { nom: "Dragon", emoji: "🐉" }, { nom: "Cerveau", emoji: "🧠" },
  { nom: "Tasse", emoji: "☕" }, { nom: "Explosion", emoji: "💥" }
];

// --- DACTYLO & SPEED TYPING ---
const phrasesDactylo = [
  "Le chasseur sache chasser sans son chien dans les bois.",
  "Chasseurs sachez chasser sans chien est un art difficile.",
  "Un dromadaire dresse un dragon dans un desert dore.",
  "Titan bot est le plus rapide de tous les robots WhatsApp !",
  "Les chaussettes de la archiduchesse sont-elles seches ?",
  "Cinq chiens chassent six chats sous un chene sombre.",
  "Un petit robot agile parcourt le reseau sans ralentir."
];

// --- COMBOS D'ÉMOJIS ---
const combosListe = [
  "🔥🚀⚡", "🦁👑✨", "🍕🥤🍔", "💀🔫🎯", "❤️‍🔥💎🎉", "🤖💻⚡",
  "🐱‍👤💥⚔️", "🌟🌙⭐", "🍦🍩🎂", "🏆🥇⚽"
];

// --- TEXTES ROYAUME & SECRET ---
const motsClesPositifsReine = ["reine", "ashley", "majesté", "souveraine"];
const reponsesBotPourReine = ["Vive la Reine !", "Gloire à Ashley !"];
const texteRevelationSecret = "🤫 *LE SECRET D'ANDY :* Le bot est une création légendaire d'Andy ! ✨";
const phrasesErreurNomSecret = ["❌ Accès refusé ! Vous n'avez pas l'autorisation d'accéder au secret."];
const phrasesExpulsionRoyaume = ["🚪 Gardes ! Expulsez cet intrus du Palais Impérial !"];

// --- COFFRE AU TRÉSOR ---
const coffreTresor = [
  "💰 10,000 Pièces d'or impériales !",
  "💎 Le Diamant Sacré du Royaume !",
  "📜 Une relique ancienne contenant un sort d'invincibilité !",
  "👑 La Couronne d'Émeraude du Souverain !",
  "🛡️ L'Écu d'Or de la Garde Impériale !"
];

// --- ESPION ---
const dictionnaireEspion = [
  { peuple: "Pizza", espion: "Nourriture" },
  { peuple: "WhatsApp", espion: "Réseau Social" },
  { peuple: "Avion", espion: "Moyen de transport" },
  { peuple: "Guitare", espion: "Instrument de musique" },
  { peuple: "Football", espion: "Sport" },
  { peuple: "Cinéma", espion: "Loisir" },
  { peuple: "Téléphone", espion: "Appareil électronique" },
  { peuple: "Chocolat", espion: "Gourmandise" }
];

// ==========================================
// 📤 EXPORTATION GLOBALE
// ==========================================
module.exports = {
  // Dépendances & Modules
  makeWASocket, useMultiFileAuthState, DisconnectReason, delay, Boom, pino,
  downloadContentFromMessage, fs, path, gTTS, ffmpeg,
  
  // Configurations
  NUMERO_BOT, NUMERO_CREATEUR, NOMS_GROUPES_CIBLES,
  
  // États en mémoire
  tempsDerniereActivite, sniperEnCours, etapeRoyaume, bombeEnCours, etapeSecret,
  devineEnCours, chaineEnCours, espionPartie, partieNiOuiNiNon, partieIntrus,
  partieEmoji, partieBaccalaureat, mariagesVirtuels, karmaMembres, inventairesMembres,
  partieLoupGarou, partieRouletteRusse, partieChasseAuTresor, partieDevineAnimal,
  partieDevineCriAnimal, partieLoupGarouTexte, partieCadavreExquis,
  partiePatateChaude, partieFauxSMS, metiersMembres, partieDactylo, partieComboEmoji,
  sessionsActives, requêtesEnAttente, partieManga,
  
  // Dictionnaires & Données
  motsClesPositifsReine, reponsesBotPourReine, texteRevelationSecret,
  phrasesErreurNomSecret, phrasesExpulsionRoyaume, dictionnaireEspion,
  emojisSimple, emojisComplexe, phrasesDactylo, combosListe, coffreTresor,
  dictionnaireBaccalaureat, dictionnaireAttaquesManga
};
