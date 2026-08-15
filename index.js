const express = require("express");
const http = require("http");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadContentFromMessage
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');

// ==========================================
// ⚙️ CONFIGURATION & PROTECTION CRASH
// ==========================================
const app = express();
const PORT = process.env.PORT || 3000;

process.on('uncaughtException', (err) => console.error('⚠️ Erreur évitée :', err));
process.on('unhandledRejection', (reason) => console.error('⚠️ Promesse rejetée :', reason));

// ==========================================
// 🌐 SERVEUR WEB & KEEP-ALIVE 24/7
// ==========================================
app.get("/", (req, res) => res.send("🤖 BOT TITAN ULTIMATE - EN LIGNE !"));
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
// 🧠 BASES DE DONNÉES EN MÉMOIRE
// ==========================================
const partiesEnCours = {}; 
const timersInactivite = {};

// ==========================================
// 📚 DONNÉES DES JEUX (LABYRINTHES & EMOJIS)
// ==========================================
const ENVIRONNEMENTS_LABYRINTHE = {
  ocean: {
    nom: "🌊 Les Abysses de l'Océan",
    mortMessage: "🌊 *ASPHYXIE TOTALE !* Votre combinaison a cédé sous la pression...",
    etapes: [
      { desc: "🌊 *Étape 1 - La Fosse Noire :*\n👉 Répondez : *@plonger* ou *@grotte*", options: { plonger: 2, grotte: "piege" } },
      { desc: "🦈 *Étape 2 - La Silhouette Abyssale :*\n👉 Répondez : *@esquiver* ou *@fusil*", options: { esquiver: 3, fusil: "combat" } },
      { desc: "🗝️ *Étape 3 - Le Sous-Marin Abandonné :*\n👉 Répondez : *@ouvrir* ou *@briser*", options: { ouvrir: 4, briser: "piege" } },
      { desc: "🏆 *RETOUR À LA SURFACE !* Vous êtes sains et saufs !", options: "victoire" }
    ]
  },
  espace: {
    nom: "🚀 La Station Spatiale Dérivante",
    mortMessage: "🌌 *DÉCOMPRESSION !* Vous dérivez sans retour...",
    etapes: [
      { desc: "🚀 *Étape 1 - Le Module d'Acouplage :*\n👉 Répondez : *@gauche* ou *@droite*", options: { gauche: 2, droite: "piege" } },
      { desc: "👾 *Étape 2 - L'Ombre Extraterrestre :*\n👉 Répondez : *@ejecter* ou *@tirer*", options: { ejecter: 3, tirer: "combat" } },
      { desc: "🛸 *Étape 3 - La Capsule de Secours :*\n👉 Répondez : *@pirater* ou *@forcer*", options: { pirater: 4, forcer: "piege" } },
      { desc: "🏆 *DÉCOLLAGE RÉUSSI !* Capsule détachée !", options: "victoire" }
    ]
  },
  donjon: {
    nom: "🏛️ Le Labyrinthe du Minotaure",
    mortMessage: "💀 *ÉCRASEMENT !* Les pièges antiques se sont refermés...",
    etapes: [
      { desc: "🚪 *Étape 1 - L'Entrée Sombre :*\n👉 Répondez : *@est* ou *@ouest*", options: { est: 2, ouest: "piege" } },
      { desc: "🗝️ *Étape 2 - La Salle des Sacrifices :*\n👉 Répondez : *@prendre* ou *@nord*", options: { prendre: "clef", nord: 3 } },
      { desc: "🧟 *Étape 3 - Le Gardien de Pierre :*\n👉 Répondez : *@attaquer* ou *@fuir*", options: { attaquer: "combat", fuir: 1 } },
      { desc: "🏆 *SALLE DU TRÉSOR !* Sortie débloquée !", options: "victoire" }
    ]
  },
  temple: {
    nom: "🏜️ Le Temple Perdu d'Anubis",
    mortMessage: "Scorpion *CATACOMBES SACRÉES !* Le sable vous a engloutis...",
    etapes: [
      { desc: "🚪 *Étape 1 - La Fresque Maudite :*\n👉 Répondez : *@nord* ou *@sud*", options: { nord: 2, sud: "piege" } },
      { desc: "🧪 *Étape 2 - L'Autel des Divinités :*\n👉 Répondez : *@boire* ou *@est*", options: { boire: "soin", est: 3 } },
      { desc: "🦂 *Étape 3 - La Née de Scorpions :*\n👉 Répondez : *@attaquer* ou *@est*", options: { attaquer: "combat", est: 4 } },
      { desc: "🏆 *LÉGENDE ÉGYPTIENNE !* Sanctuaire atteint !", options: "victoire" }
    ]
  }
};

const MOTS_SQUID = [
  { mot: "FLEUR 🌸", temps: 5 }, { mot: "TORNADE 🌪️", temps: 5 },
  { mot: "CHÂTEAU 🏰", temps: 5 }, { mot: "SQUIDCAMP 🦑", temps: 6 }
];

const CINEMATIQUES_ELIMINATION = [
  "🔫 *RATATATATA !* La poupée géante s'est retournée !",
  "🎯 *SNIPER EN POSITION !* Cible neutralisée !",
  "💥 *BOOOM !* Détection de mouvement confirmée !"
];

const OBJECTIFS_DE = [6, 4, 2, 5, 3];
const EMOJIS_DICO = ["🦁", "🍕", "🚀", "👑", "⚽", "🎮", "🎸", "💎", "🔥", "🎯"];

// ==========================================
// ⏱️ FONCTION D'ENVOI ET SIMULATION ÉCRITURE
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
    console.error("⚠️ Erreur d'envoi :", err);
  }
}

// ==========================================
// 🛠️ UTILS JEUX
// ==========================================
function choisirJoueurAleatoire(listeJoueurs, joueurActuelJid = null) {
  if (!listeJoueurs || listeJoueurs.length === 0) return null;
  const candidats = listeJoueurs.filter(j => j.jid !== joueurActuelJid);
  return (candidats.length > 0 ? candidats : listeJoueurs)[Math.floor(Math.random() * (candidats.length || 1))];
}

function reinitialiserJeu(groupId) {
  if (partiesEnCours[groupId]) {
    if (timersInactivite[groupId]) clearTimeout(timersInactivite[groupId]);
    if (partiesEnCours[groupId].timerSquid) clearTimeout(partiesEnCours[groupId].timerSquid);
    if (partiesEnCours[groupId].timerChronoLabyrinthe) clearTimeout(partiesEnCours[groupId].timerChronoLabyrinthe);
    delete partiesEnCours[groupId];
    delete timersInactivite[groupId];
  }
}

function demarrerTimerInactivite(sock, groupId) {
  if (timersInactivite[groupId]) clearTimeout(timersInactivite[groupId]);
  timersInactivite[groupId] = setTimeout(async () => {
    reinitialiserJeu(groupId);
    await envoyerAvecDelai(sock, groupId, { text: "🧹 *Fermeture du salon pour inactivité.*" });
  }, 3 * 60 * 1000);
}

async function terminerManche(groupId, sock, messageVictoire, originalMsg = null) {
  const partie = partiesEnCours[groupId];
  if (!partie) return;
  if (partie.timerChronoLabyrinthe) clearTimeout(partie.timerChronoLabyrinthe);
  partie.statut = 'ATTENTE_RELANCE';
  demarrerTimerInactivite(sock, groupId);

  const msgPrompt = `${messageVictoire}\n\n───────────────────\n🔄 *SESSION TERMINÉE !*\n👉 **.jouer** (relancer) | **.stop** (quitter)`;
  await envoyerAvecDelai(sock, groupId, { text: msgPrompt }, {}, originalMsg);
}

// ==========================================
// 🚀 DÉMARRAGE DU BOT
// ==========================================
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version, auth: state,
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
      } catch (err) { console.error("❌ Erreur Pairing Code :", err); }
    }, 4000);
  }

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', (update) => {
    if (update.connection === 'close' && update.lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) startBot();
    if (update.connection === 'open') console.log('🟢 BOT TITAN PRÊT !');
  });

  // ==========================================
  // 📩 GESTION DES MESSAGES
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

      // --- MENU ---
      if (lowerText === '.menu' || lowerText === 'menu') {
        const menuText = `🤖 *TITAN BOT - MENU* 🤖\n\n👁️ *.vv* | 📸 *.pp* | 📱 *.qr* [texte]\n🎮 *.labyrinthe* [ocean/espace/donjon/temple]\n🎲 *.de* | 🦑 *.squidgame* | 💀 *.roulette*\n🔢 *.chiffremystere* | 🎯 *.chasse-emoji*`;
        await envoyerAvecDelai(sock, remoteJid, { text: menuText }, { quoted: msg }, msg);
        return;
      }

      // --- QR CODE ---
      if (lowerText.startsWith('.qr')) {
        const txt = cleanText.replace(/^\.qr\s*/i, '').trim();
        if (!txt) return envoyerAvecDelai(sock, remoteJid, { text: "⚠️ Entrez un texte !" }, { quoted: msg }, msg);
        const qrBuffer = await QRCode.toBuffer(txt, { margin: 2, scale: 8 });
        await envoyerAvecDelai(sock, remoteJid, { image: qrBuffer, caption: `📱 *QR Code :* ${txt}` }, { quoted: msg }, msg);
        return;
      }

      // --- LABYRINTHE LOGIQUE DE DÉGÂTS (-10 HP) ---
      if (jeuEnCours && jeuEnCours.type?.startsWith('LABYRINTHE') && cleanText.startsWith('@')) {
        const action = cleanText.substring(1).trim().toLowerCase();
        const donjon = jeuEnCours.donjon;
        const etape = donjon.etapes[jeuEnCours.etapeIndex];

        if (etape?.options?.[action] !== undefined) {
          const suite = etape.options[action];
          if (suite === "piege") {
            jeuEnCours.hp -= 10; // Décrémentation de 10 HP
            if (jeuEnCours.hp <= 0) {
              await terminerManche(remoteJid, sock, `💀 *MORT !* 0% de santé restante.\n${donjon.mortMessage}`, msg);
            } else {
              await envoyerAvecDelai(sock, remoteJid, { text: `💥 *PIÈGE !* (-10 HP)\n🩸 *Santé restante :* ${jeuEnCours.hp}%` }, { quoted: msg }, msg);
            }
          } else if (typeof suite === 'number') {
            jeuEnCours.etapeIndex = suite - 1;
            const nouvEtape = donjon.etapes[jeuEnCours.etapeIndex];
            if (nouvEtape.options === "victoire") {
              await terminerManche(remoteJid, sock, `🏆 *VICTOIRE !* Donjon terminé avec ${jeuEnCours.hp}% HP !`, msg);
            } else {
              await envoyerAvecDelai(sock, remoteJid, { text: `📍 *AVANCÉE :*\n${nouvEtape.desc}` }, { quoted: msg }, msg);
            }
          }
        }
        return;
      }

      // --- COMMANDES DE DÉMARRAGE DES LABYRINTHES ---
      if (lowerText.startsWith('.labyrinthe')) {
        const mode = cleanText.split(" ")[1]?.toLowerCase();
        if (!mode || !ENVIRONNEMENTS_LABYRINTHE[mode]) {
          await envoyerAvecDelai(sock, remoteJid, { text: "🌀 *Choix :* .labyrinthe ocean | espace | donjon | temple" }, { quoted: msg }, msg);
          return;
        }
        reinitialiserJeu(remoteJid);
        partiesEnCours[remoteJid] = { type: 'LABYRINTHE', choixEnv: mode, statut: 'INSCRIPTION', joueurs: [] };
        await envoyerAvecDelai(sock, remoteJid, { text: `🚨 *SALON OUVERT (${ENVIRONNEMENTS_LABYRINTHE[mode].nom}) !*\nTapez **.inscrire** puis **.jouer**` }, { quoted: msg }, msg);
        return;
      }

    } catch (err) { console.error("⚠️ Erreur traitement :", err); }
  });
}

startBot();
