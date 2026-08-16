const express = require("express");
const http = require("http");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const ytdl = require('ytdl-core');
const google = require('google-it');
const { GoogleGenAI } = require('@google/genai');

// 🔗 LIEN AVEC LA BANQUE DE DONNÉES (data.js)
const { DICTIONNAIRE, COMMENTAIRES_LOVE, CITATIONS } = require('./data');

// ==========================================
// 🤖 INITIALISATION DE GOOGLE GEMINI AI
// ==========================================
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "VOTRE_CLE_API_ICI" });

const attendre = (ms) => new Promise(resolve => setTimeout(resolve, ms));
let derniereRequeteGemini = 0;
const DELAI_ENTRE_REQUETES = 4000; // 4 secondes d'écart

async function genererReponseGemini(prompt, maxTentatives = 3) {
  const maintenant = Date.now();
  const tempsEcoule = maintenant - derniereRequeteGemini;
  if (tempsEcoule < DELAI_ENTRE_REQUETES) {
    await attendre(DELAI_ENTRE_REQUETES - tempsEcoule);
  }

  for (let tentative = 1; tentative <= maxTentatives; tentative++) {
    try {
      derniereRequeteGemini = Date.now();
      
      const response = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: prompt,
      });

      return response.text;

    } catch (error) {
      if (error.status === 429 && tentative < maxTentatives) {
        console.warn(`[429] Limite atteinte. Attente de 10s (essai ${tentative + 1})...`);
        await attendre(10000);
      } else {
        console.error("Erreur API Gemini :", error.message || error);
        return "⚠️ Désolé, l'IA rencontre un problème de connexion pour le moment.";
      }
    }
  }
}

// ==========================================
// ⚙️ SERVEUR WEB & KEEP-ALIVE (24/7)
// ==========================================
const app = express();
const PORT = process.env.PORT || 3000;

process.on('uncaughtException', (err) => console.error('⚠️ Erreur évitée :', err));
process.on('unhandledRejection', (reason) => console.error('⚠️ Promesse rejetée :', reason));

app.get("/", (req, res) => res.send("🤖 BOT TITAN ULTIMATE - EN LIGNE 24/7 !"));
app.get("/health", (req, res) => res.status(200).send("OK"));
app.listen(PORT, () => console.log(`🌐 Serveur actif sur le port ${PORT}`));

setInterval(() => {
  const renderUrl = process.env.RENDER_EXTERNAL_URL;
  if (renderUrl) {
    http.get(renderUrl, (res) => console.log(`⏰ Keep-Alive Status: ${res.statusCode}`))
        .on('error', (err) => console.error('⚠️ Erreur Keep-Alive :', err.message));
  }
}, 8 * 60 * 1000);

// ==========================================
// 🧠 MÉMOIRE TEMPORAIRE & DONNÉES DE JEUX
// ==========================================
const partiesEnCours = {}; 
const timersInactivite = {};

const ENVIRONNEMENTS_LABYRINTHE = {
  ocean: {
    nom: "🌊 Les Abysses de l'Océan",
    etapes: [
      { desc: "🌊 *Étape 1 - La Fosse Noire :*\n👉 Répondez : *@plonger* ou *@grotte*" },
      { desc: "🦈 *Étape 2 - La Silhouette Abyssale :*\n👉 Répondez : *@esquiver* ou *@fusil*" },
      { desc: "🏆 *RETOUR À LA SURFACE !* Vous êtes sains et saufs !" }
    ]
  },
  espace: {
    nom: "🚀 La Station Spatiale Dérivante",
    etapes: [
      { desc: "🚀 *Étape 1 - Le Module d'Acouplage :*\n👉 Répondez : *@gauche* ou *@droite*" },
      { desc: "🏆 *DÉCOLLAGE RÉUSSI !* Capsule détachée !" }
    ]
  }
};

const EMOJIS_DICO = ["🦁", "🍕", "🚀", "👑", "⚽", "🎮", "💎", "🔥"];

// ==========================================
// ⏱️ GESTION DU TIMEOUT & NETTOYAGE (2 MIN)
// ==========================================
function reinitialiserJeu(groupId) {
  if (partiesEnCours[groupId]) {
    if (timersInactivite[groupId]) clearTimeout(timersInactivite[groupId]);
    delete partiesEnCours[groupId];
    delete timersInactivite[groupId];
  }
}

function demarrerTimerInactivite(sock, groupId) {
  if (timersInactivite[groupId]) clearTimeout(timersInactivite[groupId]);
  timersInactivite[groupId] = setTimeout(async () => {
    if (partiesEnCours[groupId]) {
      reinitialiserJeu(groupId);
      await envoyerAvecDelai(sock, groupId, { 
        text: "🧹 *NETTOYAGE AUTOMATIQUE :* Session fermée après 2 minutes d'inactivité." 
      });
    }
  }, 2 * 60 * 1000);
}

// ==========================================
// ⏱️ FONCTION D'ENVOI AVEC STATUT COMPOSING
// ==========================================
function calculerDelaiEnvoi(texte) {
  if (!texte || typeof texte !== 'string') return 1000;
  const nbMots = texte.trim().split(/\s+/).filter(Boolean).length;
  let minSec = nbMots < 100 ? 2 : (nbMots < 600 ? 5 : 10);
  let maxSec = nbMots < 100 ? 5 : (nbMots < 600 ? 10 : 20);
  return Math.floor((minSec + Math.random() * (maxSec - minSec)) * 1000);
}

async function envoyerAvecDelai(sock, remoteJid, content, options = {}, originalMsg = null) {
  try {
    if (originalMsg) await sock.readMessages([originalMsg.key]);
    const texte = typeof content === 'string' ? content : (content.text || content.caption || "");
    const delaiMs = calculerDelaiEnvoi(texte);

    await sock.sendPresenceUpdate('composing', remoteJid);
    await new Promise(resolve => setTimeout(resolve, delaiMs));
    await sock.sendPresenceUpdate('paused', remoteJid);

    return await sock.sendMessage(remoteJid, content, options);
  } catch (err) {
    console.error("⚠️ Erreur lors de l'envoi :", err);
  }
}

// ==========================================
// 🚀 DÉMARRAGE DU BOT
// ==========================================
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ["Ubuntu", "Chrome", "20.0.04"]
  });

  if (!sock.authState.creds.registered) {
    const phoneNumber = process.env.PHONE_NUMBER || "2250141606159";
    setTimeout(async () => {
      try {
        let code = await sock.requestPairingCode(phoneNumber.replace(/[^0-9]/g, ""));
        console.log(`\n👉 CODE DE JUMELAGE : ${code?.match(/.{1,4}/g)?.join("-") || code}\n`);
      } catch (err) {
        console.error("❌ Erreur Pairing Code :", err);
      }
    }, 4000);
  }

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close' && lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
      startBot();
    } else if (connection === 'open') {
      console.log('🟢 BOT TITAN PRÊT ET OPÉRATIONNEL !');
    }
  });

  // ==========================================
  // 📩 TRAITEMENT DES MESSAGES
  // ==========================================
  sock.ev.on('messages.upsert', async (m) => {
    try {
      const msg = m.messages[0];
      if (!msg || !msg.message || msg.key.fromMe) return;

      const remoteJid = msg.key.remoteJid;
      const senderJid = msg.key.participant || remoteJid;
      const cleanText = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();
      const lowerText = cleanText.toLowerCase();

      const jeuEnCours = partiesEnCours[remoteJid];

      demarrerTimerInactivite(sock, remoteJid);

      // 📜 MENU GENERAL
      if (lowerText === '.menu' || lowerText === 'menu') {
        const menuText = `
✨ *━━━ 🤖 TITAN BOT ULTIMATE 🤖 ━━━* ✨

👋 *Bienvenue dans le centre de commande !*

👑 *──────── ⚙️ OUTILS & IA ────────*
🔹 *.ia* [question] ➔ *IA Gemini 1.5 Flash*
🔹 *.dico* [mot] ➔ *Définition & Synonymes*
🔹 *.love* [@nom] ➔ *Test de Compatibilité*
🔹 *.citation* ➔ *Citation Inspirante*
🔹 *.qr* [texte/lien] ➔ *Générateur de QR Code*
🔹 *.image* [recherche] ➔ *Chercher une photo sur Web*
🔹 *.yt* [lien] ➔ *Télécharger une vidéo YouTube*

🎮 *──────── 🕹️ MINI-JEUX ────────*
🎲 *.de* ou *.d* ➔ *Battle Royale de Dés*
🌊 *.labyrinthe* ➔ *Aventure & Survie (Ocean/Espace)*
💀 *.roulette* ➔ *Roulette Russe (1/6)*
🔢 *.chiffremystere* ➔ *Devine le Nombre (1-100)*
🎯 *.chasse-emoji* ➔ *Épreuve de Rapidité*

📋 *──────── 📌 REJOINDRE ────────*
✍️ *.inscrire* [pseudo] ➔ *S'inscrire à une partie*
🚀 *.jouer* ➔ *Lancer la session*
🛑 *.stop* ➔ *Annuler la partie en cours*

💡 *Note : Nettoyage automatique des salons après 2 min d'inactivité.*
✨ *━━━━━━━━━━━━━━━━━━━━━━━━━* ✨`;

        await envoyerAvecDelai(sock, remoteJid, { text: menuText }, { quoted: msg }, msg);
        return;
      }

      // 🤖 IA CONVERSATIONNELLE (GEMINI FLASH 1.5)
      if (lowerText.startsWith('.ia')) {
        const question = cleanText.replace(/^\.ia\s*/i, '').trim();
        if (!question) {
          await envoyerAvecDelai(sock, remoteJid, { text: "⚠️ Posez une question ! (Exemple : `.ia Explique la gravité`)" }, { quoted: msg }, msg);
          return;
        }

        const reponse = await genererReponseGemini(question);
        await envoyerAvecDelai(sock, remoteJid, { text: `🤖 *TITAN IA (Gemini) :*\n\n${reponse}` }, { quoted: msg }, msg);
        return;
      }

      // 🖼️ RECHERCHE D'IMAGE (.image)
      if (lowerText.startsWith('.image')) {
        const query = cleanText.replace(/^\.image\s*/i, '').trim();
        if (!query) {
          await envoyerAvecDelai(sock, remoteJid, { text: "⚠️ Précisez votre recherche ! (Exemple : `.image un chien`)" }, { quoted: msg }, msg);
          return;
        }

        try {
          const results = await google({ query: `${query} images`, disableConsole: true });
          if (!results || results.length === 0) {
            await envoyerAvecDelai(sock, remoteJid, { text: "❌ Aucune image trouvée pour cette recherche." }, { quoted: msg }, msg);
            return;
          }

          const firstResult = results[0];
          await envoyerAvecDelai(sock, remoteJid, { 
            text: `🖼️ *Résultat pour :* ${query}\n🔗 ${firstResult.link}` 
          }, { quoted: msg }, msg);

        } catch (err) {
          console.error("Erreur recherche image :", err);
          await envoyerAvecDelai(sock, remoteJid, { text: "⚠️ Impossible de récupérer l'image pour le moment." }, { quoted: msg }, msg);
        }
        return;
      }

      // 📥 TÉLÉCHARGEMENT DE VIDÉO YOUTUBE (.yt)
      if (lowerText.startsWith('.yt') || lowerText.startsWith('.video')) {
        const url = cleanText.split(" ")[1]?.trim();
        if (!url || !ytdl.validateURL(url)) {
          await envoyerAvecDelai(sock, remoteJid, { text: "⚠️ Veuillez fournir un lien YouTube valide ! (Exemple : `.yt https://youtube.com/...`)" }, { quoted: msg }, msg);
          return;
        }

        try {
          await envoyerAvecDelai(sock, remoteJid, { text: "⏳ *Téléchargement de la vidéo en cours...*" }, { quoted: msg }, msg);

          const info = await ytdl.getInfo(url);
          const format = ytdl.chooseFormat(info.formats, { quality: 'lowestvideo', filter: 'videoandaudio' });

          await envoyerAvecDelai(sock, remoteJid, { 
            video: { url: format.url }, 
            caption: `🎥 *Titre :* ${info.videoDetails.title}` 
          }, { quoted: msg }, msg);

        } catch (err) {
          console.error("Erreur téléchargement YouTube :", err);
          await envoyerAvecDelai(sock, remoteJid, { text: "❌ Échec du téléchargement de la vidéo." }, { quoted: msg }, msg);
        }
        return;
      }

      // 📱 QR CODE
      if (lowerText.startsWith('.qr')) {
        const txt = cleanText.replace(/^\.qr\s*/i, '').trim();
        if (!txt) return;
        const qrBuffer = await QRCode.toBuffer(txt, { margin: 2, scale: 8 });
        await envoyerAvecDelai(sock, remoteJid, { image: qrBuffer, caption: `📱 *QR Code :* ${txt}` }, { quoted: msg }, msg);
        return;
      }

      // 📖 DICTIONNAIRE & SYNONYMES
      if (lowerText.startsWith('.dico') || lowerText.startsWith('.def')) {
        const mot = cleanText.split(" ")[1]?.toLowerCase();
        if (!mot || !DICTIONNAIRE[mot]) {
          await envoyerAvecDelai(sock, remoteJid, { text: `📖 Mots dispo : *${Object.keys(DICTIONNAIRE).join(', ')}*` }, { quoted: msg }, msg);
          return;
        }
        const data = DICTIONNAIRE[mot];
        await envoyerAvecDelai(sock, remoteJid, { text: `📚 *${mot.toUpperCase()}*\n📝 ${data.def}\n🔄 *Synonymes :* ${data.syn.join(', ')}` }, { quoted: msg }, msg);
        return;
      }

      // ❤️ TEST D'AMOUR
      if (lowerText.startsWith('.love')) {
        const score = Math.floor(Math.random() * 101);
        let list = score > 70 ? COMMENTAIRES_LOVE.parfait : (score > 35 ? COMMENTAIRES_LOVE.moyen : COMMENTAIRES_LOVE.faible);
        await envoyerAvecDelai(sock, remoteJid, { text: `💘 *COMPATIBILITÉ : ${score}%*\n💬 ${list[Math.floor(Math.random() * list.length)]}` }, { quoted: msg }, msg);
        return;
      }

      // 📜 CITATION DU JOUR
      if (lowerText === '.citation') {
        const c = CITATIONS[Math.floor(Math.random() * CITATIONS.length)];
        await envoyerAvecDelai(sock, remoteJid, { text: `📜 « ${c.c} »\n✍️ *${c.a}*` }, { quoted: msg }, msg);
        return;
      }

      // 🎲 DÉ BATTLE (.de ou .d)
      if (lowerText === '.de' || lowerText === '.d') {
        reinitialiserJeu(remoteJid);
        partiesEnCours[remoteJid] = { type: 'DE_BATTLE', statut: 'INSCRIPTION', joueurs: [], tourIndex: 0 };
        await envoyerAvecDelai(sock, remoteJid, { text: `🎲 *SALON DÉ BATTLE OUVERT !*\n👉 **.inscrire** puis **.jouer** !` }, { quoted: msg }, msg);
        return;
      }

      // 🌊 LABYRINTHE
      if (lowerText.startsWith('.labyrinthe')) {
        const mode = cleanText.split(" ")[1]?.toLowerCase();
        if (!mode || !ENVIRONNEMENTS_LABYRINTHE[mode]) {
          await envoyerAvecDelai(sock, remoteJid, { text: "🌀 Choix dispo : `.labyrinthe ocean` ou `.labyrinthe espace`" }, { quoted: msg }, msg);
          return;
        }
        reinitialiserJeu(remoteJid);
        partiesEnCours[remoteJid] = { type: 'LABYRINTHE', choixEnv: mode, statut: 'INSCRIPTION', joueurs: [] };
        await envoyerAvecDelai(sock, remoteJid, { text: `🚨 *SALON LABYRINTHE OUVERT !*\n👉 **.inscrire** puis **.jouer** !` }, { quoted: msg }, msg);
        return;
      }

      // 💀 ROULETTE RUSSE
      if (lowerText === '.roulette') {
        reinitialiserJeu(remoteJid);
        partiesEnCours[remoteJid] = { type: 'ROULETTE', statut: 'EN_COURS', chambreBalle: Math.floor(Math.random() * 6) + 1, chambreActuelle: 1 };
        await envoyerAvecDelai(sock, remoteJid, { text: `💀 *REVOLVER CHARGÉ (1/6) !*\n👉 Envoie *@tirer* !` }, { quoted: msg }, msg);
        return;
      }

      // 🔢 CHIFFRE MYSTÈRE
      if (lowerText === '.chiffremystere') {
        reinitialiserJeu(remoteJid);
        partiesEnCours[remoteJid] = { type: 'CHIFFRE_MYSTERE', statut: 'EN_COURS', solution: Math.floor(Math.random() * 100) + 1 };
        await envoyerAvecDelai(sock, remoteJid, { text: `🔢 *CHIFFRE MYSTÈRE INITIALISÉ (1 à 100) !*\n👉 Répondez avec *@nombre* !` }, { quoted: msg }, msg);
        return;
      }

      // 🎯 CHASSE EMOJI
      if (lowerText === '.chasse-emoji') {
        reinitialiserJeu(remoteJid);
        const cible = EMOJIS_DICO[Math.floor(Math.random() * EMOJIS_DICO.length)];
        partiesEnCours[remoteJid] = { type: 'CHASSE_EMOJI', statut: 'EN_COURS', cible };
        await envoyerAvecDelai(sock, remoteJid, { text: `🎯 *RAPIDITÉ !* Premier à envoyer **@${cible}** gagne !` }, { quoted: msg }, msg);
        return;
      }

      // ✍️ INSCRIPTION & DÉMARRAGE
      if (lowerText.startsWith('.inscrire')) {
        if (!jeuEnCours || jeuEnCours.statut !== 'INSCRIPTION') return;
        const pseudo = cleanText.split(" ")[1] || "JOUEUR";
        jeuEnCours.joueurs.push({ jid: senderJid, pseudo });
        await envoyerAvecDelai(sock, remoteJid, { text: `✅ *${pseudo}* rejoint la partie !` }, { quoted: msg }, msg);
        return;
      }

      if (lowerText === '.jouer') {
        if (!jeuEnCours || jeuEnCours.statut !== 'INSCRIPTION') return;
        jeuEnCours.statut = 'EN_COURS';
        await envoyerAvecDelai(sock, remoteJid, { text: `🚀 *LA PARTIE COMMENCE !*` }, { quoted: msg }, msg);
        return;
      }

      if (lowerText === '.stop') {
        reinitialiserJeu(remoteJid);
        await envoyerAvecDelai(sock, remoteJid, { text: "🛑 *Partie arrêtée.*" }, { quoted: msg }, msg);
        return;
      }

      // 🎯 ACTIONS EN JEU (AVEC SIGNE @)
      if (jeuEnCours && jeuEnCours.statut === 'EN_COURS' && cleanText.startsWith('@')) {
        const action = cleanText.substring(1).trim().toLowerCase();

        if (jeuEnCours.type === 'ROULETTE' && action === 'tirer') {
          if (jeuEnCours.chambreBalle === jeuEnCours.chambreActuelle) {
            reinitialiserJeu(remoteJid);
            await envoyerAvecDelai(sock, remoteJid, { text: `💥 *BANG !* Perdu !` }, { quoted: msg }, msg);
          } else {
            jeuEnCours.chambreActuelle++;
            await envoyerAvecDelai(sock, remoteJid, { text: `🔊 *CLIC !* Chambre vide. Au suivant !` }, { quoted: msg }, msg);
          }
        }

        if (jeuEnCours.type === 'CHIFFRE_MYSTERE') {
          const val = parseInt(action, 10);
          if (val === jeuEnCours.solution) {
            reinitialiserJeu(remoteJid);
            await envoyerAvecDelai(sock, remoteJid, { text: `🏆 *BRAVO !* Le nombre était **${val}** !` }, { quoted: msg }, msg);
          } else if (val < jeuEnCours.solution) {
            await envoyerAvecDelai(sock, remoteJid, { text: `📈 C'est plus grand que ${val} !` }, { quoted: msg }, msg);
          } else if (val > jeuEnCours.solution) {
            await envoyerAvecDelai(sock, remoteJid, { text: `📉 C'est plus petit que ${val} !` }, { quoted: msg }, msg);
          }
        }

        if (jeuEnCours.type === 'CHASSE_EMOJI' && action === jeuEnCours.cible.toLowerCase()) {
          reinitialiserJeu(remoteJid);
          await envoyerAvecDelai(sock, remoteJid, { text: `🏆 *GAGNÉ !* Vous avez été le plus rapide !` }, { quoted: msg }, msg);
        }
      }

    } catch (err) {
      console.error("⚠️ Erreur :", err);
    }
  });
}

startBot();
