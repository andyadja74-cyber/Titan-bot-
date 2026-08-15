const express = require("express");
const http = require("http");
const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// 1. SERVEUR WEB & KEEP-ALIVE 24/7 (RENDER)
// ==========================================
app.get("/", (req, res) => {
  res.send("🤖 BOT TITAN ULTIMATE - EN LIGNE 24/7 !");
});

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

app.listen(PORT, () => {
  console.log(`🌐 Serveur Web actif sur le port ${PORT}`);
});

setInterval(() => {
  const renderUrl = process.env.RENDER_EXTERNAL_URL;
  if (renderUrl) {
    http.get(renderUrl, (res) => {
      console.log(`⏰ Keep-Alive Status: ${res.statusCode}`);
    }).on('error', (err) => {
      console.error('⚠️ Erreur Keep-Alive :', err.message);
    });
  }
}, 8 * 60 * 1000);

// ==========================================
// 📦 IMPORTS & DÉPENDANCES
// ==========================================
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
// 🧠 BASE DE DONNÉES EN MÉMOIRE (RAM)
// ==========================================
const partiesEnCours = {}; 
const timersInactivite = {};

// ==========================================
// ⏱️ FONCTIONS DE DÉLAI D'ENVOI PROGRESSIF
// ==========================================
function calculerDelaiEnvoi(texte) {
  if (!texte || typeof texte !== 'string') return 1000;
  
  const nbMots = texte.trim().split(/\s+/).filter(Boolean).length;
  let minSec, maxSec, minMots, maxMots;

  if (nbMots < 100) {
    minSec = 5;
    maxSec = 20;
    minMots = 1;
    maxMots = 100;
  } else if (nbMots < 600) {
    minSec = 2;
    maxSec = 35;
    minMots = 100;
    maxMots = 600;
  } else {
    minSec = 2;
    maxSec = 45;
    minMots = 600;
    maxMots = 2000;
  }

  const ratio = Math.min(Math.max((nbMots - minMots) / (maxMots - minMots), 0), 1);
  const delaiMs = Math.floor((minSec + ratio * (maxSec - minSec)) * 1000);
  return delaiMs;
}

async function envoyerAvecDelai(sock, remoteJid, content, options = {}) {
  const texte = typeof content === 'string' ? content : (content.text || content.caption || "");
  const delaiMs = calculerDelaiEnvoi(texte);
  await new Promise(resolve => setTimeout(resolve, delaiMs));
  return await sock.sendMessage(remoteJid, content, options);
}

// ==========================================
// 📚 DICTIONNAIRES DE THÈMES & DONJONS
// ==========================================
const ENVIRONNEMENTS_LABYRINTHE = {
  ocean: {
    nom: "🌊 Les Abysses de l'Océan",
    mortMessage: "🌊 *NOYADE !* Vous n'avez plus d'oxygène au fond des abysses !",
    etapes: [
      { desc: "🌊 *Étape 1 - La Fosse Noire :* La pression augmente et votre réserve d'oxygène baisse.\n👉 Répondez : *@plonger* (suivre le courant) ou *@grotte* (entrer dans une faille)", options: { plonger: 2, grotte: "piege" } },
      { desc: "🦈 *Étape 2 - Le Nid de Requins :* Un squale géant rode autour des ruines.\n👉 Répondez : *@esquiver* (nager doucement) ou *@fusil* (utiliser le harpon)", options: { esquiver: 3, fusil: "combat" } },
      { desc: "🗝️ *Étape 3 - Le Sarcophage Englouti :* Une porte étanche bloque le sous-marin d'évacuation !\n👉 Répondez : *@ouvrir* avec le levier ou *@briser* la vitre", options: { ouvrir: 4, briser: "piege" } },
      { desc: "🏆 *SURFACE ATTEINTE :* Vous avez regagné la surface à temps avant l'asphyxie !", options: "victoire" }
    ]
  },
  espace: {
    nom: "🚀 La Station Spatiale Dérivante",
    mortMessage: "🌌 *ASPHYXIE !* La réserve de la combinaison est vide dans le vide spatial !",
    etapes: [
      { desc: "🚀 *Étape 1 - Module d'Acouplage :* Les réacteurs fuient et la réserve d'oxygène diminue !\n👉 Répondez : *@gauche* (sas de sécurité) ou *@droite* (salle des machines)", options: { gauche: 2, droite: "piege" } },
      { desc: "👾 *Étape 2 - Intrus Extraterrestre :* Une forme de vie parasite bloque le couloir principal.\n👉 Répondez : *@ejecter* (ouvrir le sas de décompression) ou *@tirer* (laser)", options: { ejecter: 3, tirer: "combat" } },
      { desc: "🛸 *Étape 3 - Le Vaisseau de Secours :* Le cockpit est verrouillé par un code.\n👉 Répondez : *@pirater* le système ou *@forcer* la commande manual", options: { pirater: 4, forcer: "piege" } },
      { desc: "🏆 *VAISSEAU DÉCOLLÉ :* Vous avez démarré les moteurs et quitté l'orbite !", options: "victoire" }
    ]
  },
  donjon: {
    nom: "🏛️ Le Labyrinthe du Minotaure",
    mortMessage: "💀 *ÉCRASEMENT !* Les murs du labyrinthe se sont refermés !",
    etapes: [
      { desc: "🚪 *Étape 1 :* Galerie sombre en pierre.\n👉 Répondez : *@est* ou *@ouest*", options: { est: 2, ouest: "piege" } },
      { desc: "🗝️ *Étape 2 :* Un coffre poussiéreux.\n👉 Répondez : *@prendre* pour ramasser la clé ou *@nord* pour avancer.", options: { prendre: "clef", nord: 3 } },
      { desc: "🧟 *Étape 3 :* Un Minotaure enragé surgit de l'ombre !\n👉 Répondez : *@attaquer* ou *@fuir* !", options: { attaquer: "combat", fuir: 1 } },
      { desc: "🏆 *SALLE DU TRÉSOR :* Labyrinthe vaincu avec succès !", options: "victoire" }
    ]
  },
  temple: {
    nom: "🏜️ Le Temple Perdu d'Anubis",
    mortMessage: "sc *PIÈGE DU PHARAON !* Le gaz toxique a rempli le temple !",
    etapes: [
      { desc: "🚪 *Étape 1 :* Les hiéroglyphes s'illuminent.\n👉 Répondez : *@nord* ou *@sud*", options: { nord: 2, sud: "piege" } },
      { desc: "🧪 *Étape 2 :* Une fontaine magique stagne au centre.\n👉 Répondez : *@boire* (+30 HP) ou *@est* pour continuer.", options: { boire: "soin", est: 3 } },
      { desc: "sc *Étape 3 :* Des scorpions géants bloquent la porte !\n👉 Répondez : *@attaquer* ou *@est*", options: { attaquer: "combat", est: 4 } },
      { desc: "🏆 *SALLE DU TRÉSOR :* Le sarcophage divin s'ouvre ! Victoire !", options: "victoire" }
    ]
  }
};

const MOTS_SQUID = [
  { mot: "FLEUR 🌸", temps: 5 },
  { mot: "TORNADE 🌪️", temps: 5 },
  { mot: "CHÂTEAU 🏰", temps: 5 },
  { mot: "SERPENT 🐍", temps: 5 },
  { mot: "BOUCLIER 🛡️", temps: 6 },
  { mot: "SQUIDCAMP 🦑", temps: 6 },
  { mot: "CHRONOMÈTRE ⏱️", temps: 6 },
  { mot: "EXTRA-TERRESTRE 👽", temps: 7 },
  { mot: "CATHÉDRALE ⛪", temps: 7 },
  { mot: "LIGNE ROUGE 🔴", temps: 7 }
];

const CINEMATIQUES_ELIMINATION = [
  "🔫 *RATATATATA !* La poupée géante 🤖 s'est retournée subitement !",
  "🎯 *SNIPER EN POSITION !* Tir de précision... Cible éliminée !",
  "💥 *BOOOM !* Capteur de mouvement activé !",
  "🚨 *ALERTE ROUGE !* Temps dépassé !"
];

const OBJECTIFS_DE = [6, 4, 2, 5, 3];
const EMOJIS_DICO = ["🦁", "🍕", "🚀", "👑", "⚽", "🎮", "🎸", "💎", "🔥", "🦄", "🎯", "🤖", "🌮", "🐉"];

// ==========================================
// ⚙️ FONCTIONS UTILITAIRES
// ==========================================
function choisirJoueurAleatoire(listeJoueurs, joueurActuelJid = null) {
  if (!listeJoueurs || listeJoueurs.length === 0) return null;
  if (listeJoueurs.length === 1) return listeJoueurs[0];
  const candidats = listeJoueurs.filter(j => j.jid !== joueurActuelJid);
  const listeFinale = candidats.length > 0 ? candidats : listeJoueurs;
  return listeFinale[Math.floor(Math.random() * listeFinale.length)];
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
    await envoyerAvecDelai(sock, groupId, { text: "🧹 *NETTOYAGE RAM :* Salon fermé pour inactivité." });
  }, 3 * 60 * 1000);
}

async function terminerManche(groupId, sock, messageVictoire) {
  const partie = partiesEnCours[groupId];
  if (!partie) return;

  if (partie.timerChronoLabyrinthe) clearTimeout(partie.timerChronoLabyrinthe);
  partie.statut = 'ATTENTE_RELANCE';
  demarrerTimerInactivite(sock, groupId);

  let msgPrompt = `${messageVictoire}\n\n`;
  msgPrompt += `───────────────────\n`;
  msgPrompt += `🔄 *PARTIE FINIE !*\n\n`;
  msgPrompt += `👉 Tapez **.jouer** pour relancer !\n`;
  msgPrompt += `👉 Tapez **.stop** pour fermer le salon.`;

  await envoyerAvecDelai(sock, groupId, { text: msgPrompt });
}

async function lancerTourSquidGame(sock, remoteJid) {
  const party = partiesEnCours[remoteJid];
  if (!party || party.type !== 'SQUID_GAME' || party.statut !== 'EN_COURS') return;

  if (party.joueurs.length <= 1) {
    const gagnant = party.joueurs[0];
    await terminerManche(remoteJid, sock, `🏆 *SURVIVANT ULTIME : @${gagnant.jid.split('@')[0]} (${gagnant.pseudo}) !* 🦑🎉`);
    return;
  }

  const joueurActuel = party.joueurs[party.tourIndex];
  const epreuve = MOTS_SQUID[Math.floor(Math.random() * MOTS_SQUID.length)];
  party.motAttendu = epreuve.mot.toLowerCase();
  party.enAttenteReponse = true;

  let msgVert = `🟢 *FEU VERT ! SQUID GAME*\n\n`;
  msgVert += `👤 *Candidat :* @${joueurActuel.jid.split('@')[0]} (*${joueurActuel.pseudo}*)\n`;
  msgVert += `⏱️ *Temps :* **${epreuve.temps} secondes** !\n\n`;
  msgVert += `👉 Recopie : *@${epreuve.mot}*`;

  await envoyerAvecDelai(sock, remoteJid, { text: msgVert, mentions: [joueurActuel.jid] });

  if (party.timerSquid) clearTimeout(party.timerSquid);
  
  party.timerSquid = setTimeout(async () => {
    if (partiesEnCours[remoteJid] && party.enAttenteReponse) {
      party.enAttenteReponse = false;
      const cinematique = CINEMATIQUES_ELIMINATION[Math.floor(Math.random() * CINEMATIQUES_ELIMINATION.length)];
      
      let msgElim = `🔴 *TEMPS ÉCOULÉ !\n\n${cinematique}\n\n💀 *@${joueurActuel.jid.split('@')[0]}* est **ÉLIMINÉ** !`;

      party.joueurs.splice(party.tourIndex, 1);
      if (party.joueurs.length > 0) {
        party.tourIndex = party.tourIndex % party.joueurs.length;
      }

      await envoyerAvecDelai(sock, remoteJid, { text: msgElim, mentions: [joueurActuel.jid] });
      setTimeout(() => lancerTourSquidGame(sock, remoteJid), 2500);
    }
  }, epreuve.temps * 1000);
}

// ==========================================
// 🔌 DÉMARRAGE BOT
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
        code = code?.match(/.{1,4}/g)?.join("-") || code;
        console.log(`\n👉 CODE DE JUMELAGE : ${code}\n`);
      } catch (err) {
        console.error("❌ Erreur Pairing Code :", err);
      }
    }, 4000);
  }

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      console.log('🟢 BOT TITAN PRÊT (DÉLAI PROGRESSIF ET SURVIE OK) !');
    }
  });

  // ==========================================
  // 📩 GESTION DES MESSAGES
  // ==========================================
  sock.ev.on('messages.upsert', async (m) => {
    try {
      const msg = m.messages[0];
      if (!msg || !msg.message || msg.key.fromMe) return;

      const remoteJid = msg.key.remoteJid;
      const senderJid = msg.key.participant || msg.key.remoteJid;

      const cleanText = (msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || "").trim();
      const lowerText = cleanText.toLowerCase();

      const jeuEnCours = partiesEnCours[remoteJid];

      // ----------------------------------------------------
      // 📱 GÉNÉRATEUR DE CODE QR (.qr / .qrcode)
      // ----------------------------------------------------
      if (lowerText.startsWith('.qr') || lowerText.startsWith('.qrcode')) {
        const texteAEncoder = cleanText.replace(/^\.(qr|qrcode)\s*/i, '').trim();
        
        if (!texteAEncoder) {
          await envoyerAvecDelai(sock, remoteJid, { text: "⚠️ *Veuillez fournir un texte ou un lien pour le Code QR !*\n\n👉 Exemple : `.qr https://google.com` ou `.qr Mon texte`" }, { quoted: msg });
          return;
        }

        try {
          const qrBuffer = await QRCode.toBuffer(texteAEncoder, { margin: 2, scale: 8 });
          await envoyerAvecDelai(sock, remoteJid, { 
            image: qrBuffer, 
            caption: `📱 *CODE QR GÉNÉRÉ*\n\n📝 *Contenu :* ${texteAEncoder}` 
          }, { quoted: msg });
        } catch (err) {
          await envoyerAvecDelai(sock, remoteJid, { text: "❌ *Erreur lors de la création du code QR.*" }, { quoted: msg });
        }
        return;
      }

      // ----------------------------------------------------
      // 👁️ VUE UNIQUE (.vv) & PP (.pp)
      // ----------------------------------------------------
      if (lowerText === '.vv' || lowerText === '.vueunique' || lowerText === '.r') {
        const quotedMsg = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
        let viewOnceContent = quotedMsg?.viewOnceMessage?.message 
                           || quotedMsg?.viewOnceMessageV2?.message 
                           || quotedMsg?.viewOnceMessageV2Extension?.message;

        if (!viewOnceContent && (msg.message.viewOnceMessage || msg.message.viewOnceMessageV2)) {
          viewOnceContent = msg.message.viewOnceMessage?.message || msg.message.viewOnceMessageV2?.message;
        }

        if (!viewOnceContent) {
          await envoyerAvecDelai(sock, remoteJid, { text: "⚠️ *Répondez à un message à vue unique avec .vv !*" }, { quoted: msg });
          return;
        }

        const mediaType = viewOnceContent.imageMessage ? 'image' : viewOnceContent.videoMessage ? 'video' : null;
        if (!mediaType) {
          await envoyerAvecDelai(sock, remoteJid, { text: "⚠️ Média non supporté." }, { quoted: msg });
          return;
        }

        const mediaMessage = viewOnceContent.imageMessage || viewOnceContent.videoMessage;
        const stream = await downloadContentFromMessage(mediaMessage, mediaType);
        let buffer = Buffer.from([]);
        for await (const chunk of stream) { buffer = Buffer.concat([buffer, chunk]); }

        const caption = mediaMessage.caption ? `📩 *Vue Unique débloquée :*\n${mediaMessage.caption}` : "🔓 *Vue Unique débloquée !*";
        if (mediaType === 'image') {
          await envoyerAvecDelai(sock, remoteJid, { image: buffer, caption: caption }, { quoted: msg });
        } else if (mediaType === 'video') {
          await envoyerAvecDelai(sock, remoteJid, { video: buffer, caption: caption }, { quoted: msg });
        }
        return;
      }

      if (lowerText.startsWith('.pp') || lowerText.startsWith('.getpp')) {
        let targetJid = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] 
                     || msg.message.extendedTextMessage?.contextInfo?.participant 
                     || senderJid;
        try {
          const ppUrl = await sock.profilePictureUrl(targetJid, 'image');
          await envoyerAvecDelai(sock, remoteJid, { image: { url: ppUrl }, caption: `📸 *PP de :* @${targetJid.split('@')[0]}`, mentions: [targetJid] }, { quoted: msg });
        } catch (e) {
          await envoyerAvecDelai(sock, remoteJid, { text: `❌ Photo introuvable ou privée.` }, { quoted: msg });
        }
        return;
      }

      // ----------------------------------------------------
      // ✍️ INSCRIPTION FACILITÉE (.inscrire)
      // ----------------------------------------------------
      if (jeuEnCours && jeuEnCours.statut === 'EN_ATTENTE_PSEUDO' && jeuEnCours.attenteJid === senderJid) {
        const pseudo = cleanText.trim().substring(0, 10).toUpperCase();
        delete jeuEnCours.attenteJid;
        jeuEnCours.statut = 'INSCRIPTION';
        
        jeuEnCours.joueurs.push({ jid: senderJid, pseudo: pseudo || "JOUEUR" });
        let listePseudos = jeuEnCours.joueurs.map((j, i) => `${i + 1}. *${j.pseudo}* (@${j.jid.split('@')[0]})`).join("\n");
        await envoyerAvecDelai(sock, remoteJid, { 
          text: `✅ Surnom enregistré : *${pseudo}* !\n\n👥 *Inscrits (${jeuEnCours.joueurs.length}) :*\n${listePseudos}\n\n👉 Tapez **.jouer** pour démarrer !`,
          mentions: jeuEnCours.joueurs.map(j => j.jid)
        }, { quoted: msg });
        return;
      }

      if (lowerText.startsWith('.inscrire') || lowerText.startsWith('.rejoindre')) {
        if (!jeuEnCours || (jeuEnCours.statut !== 'INSCRIPTION' && jeuEnCours.statut !== 'EN_ATTENTE_PSEUDO')) {
          await envoyerAvecDelai(sock, remoteJid, { text: "⚠️ Aucun salon d'inscription ouvert." }, { quoted: msg });
          return;
        }

        const args = cleanText.split(" ");
        let pseudo = args[1];

        const existe = jeuEnCours.joueurs.find(j => j.jid === senderJid);
        if (existe) {
          await envoyerAvecDelai(sock, remoteJid, { text: `⚠️ Tu es déjà inscrit sous *${existe.pseudo}* !` }, { quoted: msg });
          return;
        }

        if (!pseudo) {
          jeuEnCours.statut = 'EN_ATTENTE_PSEUDO';
          jeuEnCours.attenteJid = senderJid;
          await envoyerAvecDelai(sock, remoteJid, { text: "📝 *Entre ton surnom / pseudo directement ci-dessous :*" }, { quoted: msg });
          return;
        }

        jeuEnCours.joueurs.push({ jid: senderJid, pseudo: pseudo.toUpperCase() });
        demarrerTimerInactivite(sock, remoteJid);

        let listePseudos = jeuEnCours.joueurs.map((j, i) => `${i + 1}. *${j.pseudo}* (@${j.jid.split('@')[0]})`).join("\n");
        await envoyerAvecDelai(sock, remoteJid, { 
          text: `✅ *${pseudo.toUpperCase()}* a rejoint !\n\n👥 *Inscrits (${jeuEnCours.joueurs.length}) :*\n${listePseudos}\n\n👉 Tapez **.jouer** pour lancer !`,
          mentions: jeuEnCours.joueurs.map(j => j.jid)
        }, { quoted: msg });
        return;
      }

      // ----------------------------------------------------
      // 🎯 ACTIONS DANS LES JEUX (COMMANDES AVEC @)
      // ----------------------------------------------------
      if (jeuEnCours && jeuEnCours.statut === 'EN_COURS' && cleanText.startsWith('@')) {
        demarrerTimerInactivite(sock, remoteJid);
        const action = cleanText.substring(1).trim().toLowerCase();

        // 🏛️ 1. LABYRINTHE & SURVIE
        if (jeuEnCours.type.startsWith('LABYRINTHE')) {
          if (jeuEnCours.joueurActif && jeuEnCours.joueurActif.jid !== senderJid) {
            await envoyerAvecDelai(sock, remoteJid, { 
              text: `⚠️ Ce n'est pas ton tour ! C'est à *@${jeuEnCours.joueurActif.jid.split('@')[0]}* !`,
              mentions: [senderJid, jeuEnCours.joueurActif.jid] 
            }, { quoted: msg });
            return;
          }

          const donjon = jeuEnCours.donjon;
          const etapeActuelle = donjon.etapes[jeuEnCours.etapeIndex];

          if (etapeActuelle.options[action] !== undefined) {
            const suite = etapeActuelle.options[action];

            if (jeuEnCours.joueurs && jeuEnCours.joueurs.length > 0) {
              jeuEnCours.joueurActif = choisirJoueurAleatoire(jeuEnCours.joueurs, senderJid);
            }

            const mentionSuivant = jeuEnCours.joueurActif ? `\n\n🎯 *Prochain tour :* @${jeuEnCours.joueurActif.jid.split('@')[0]}` : "";
            const mentionsList = jeuEnCours.joueurActif ? [jeuEnCours.joueurActif.jid] : [];

            if (suite === "piege") {
              jeuEnCours.hp -= 35;
              if (jeuEnCours.hp <= 0) {
                await terminerManche(remoteJid, sock, `💀 *ÉCHEC SURVIE !* @${senderJid.split('@')[0]} s'est trompé de voie !\n${donjon.mortMessage}`);
              } else {
                await envoyerAvecDelai(sock, remoteJid, { 
                  text: `💥 *OBSTACLE / PIÈGE !* (-35 HP)\n🩸 *Santé/Oxygène :* ${jeuEnCours.hp}%\n\n${etapeActuelle.desc}${mentionSuivant}`,
                  mentions: mentionsList
                }, { quoted: msg });
              }
            } else if (suite === "soin") {
              jeuEnCours.hp = Math.min(100, jeuEnCours.hp + 30);
              await envoyerAvecDelai(sock, remoteJid, { 
                text: `🧪 *RÉSERVE RESTAURÉE !* (+30% HP/Oxygène)\n👉 Tapez *@est* pour poursuivre.${mentionSuivant}`,
                mentions: mentionsList
              }, { quoted: msg });
            } else if (suite === "combat") {
              if (Math.random() > 0.3) {
                jeuEnCours.etapeIndex += 1;
                await envoyerAvecDelai(sock, remoteJid, { 
                  text: `⚔️ *OBSTACLE FRANCHI !*\n\n${donjon.etapes[jeuEnCours.etapeIndex].desc}${mentionSuivant}`,
                  mentions: mentionsList
                }, { quoted: msg });
              } else {
                jeuEnCours.hp -= 40;
                if (jeuEnCours.hp <= 0) {
                  await terminerManche(remoteJid, sock, `💀 *MORT SUR LE COUP !* Dommage critique subi !`);
                } else {
                  await envoyerAvecDelai(sock, remoteJid, { 
                    text: `🩸 *ÉCHEC DE L'ACTION !* (-40 HP) - Réservez encore vos actions !\n👉 Tapez *@esquiver* ou *@ejecter* !${mentionSuivant}`,
                    mentions: mentionsList
                  }, { quoted: msg });
                }
              }
            } else if (typeof suite === 'number') {
              jeuEnCours.etapeIndex = suite - 1;
              const nouvEtape = donjon.etapes[jeuEnCours.etapeIndex];
              if (nouvEtape.options === "victoire") {
                await terminerManche(remoteJid, sock, `🏆 *SURVIE ET VICTOIRE !* Vous avez réussi à sortir du labyrinthe **${donjon.nom}** avec **${jeuEnCours.hp}% d'oxygène/HP** ! 🎉`);
              } else {
                await envoyerAvecDelai(sock, remoteJid, { 
                  text: `📍 *PROGRESSION :*\n\n${nouvEtape.desc}${mentionSuivant}`,
                  mentions: mentionsList
                }, { quoted: msg });
              }
            }
          }
          return;
        }

        // 🎲 2. DÉ BATTLE
        if (jeuEnCours.type === 'DE_BATTLE') {
          const joueurActuel = jeuEnCours.joueurs[jeuEnCours.tourIndex];
          if (joueurActuel.jid !== senderJid) {
            await envoyerAvecDelai(sock, remoteJid, { text: `⚠️ Ce n'est pas ton tour ! C'est à *@${joueurActuel.jid.split('@')[0]}* !`, mentions: [joueurActuel.jid] }, { quoted: msg });
            return;
          }

          if (action === 'lancer' || action === 'de') {
            const deResultat = Math.floor(Math.random() * 6) + 1;
            if (deResultat === jeuEnCours.objectif) {
              jeuEnCours.qualifies.push(joueurActuel);
              await envoyerAvecDelai(sock, remoteJid, { text: `🎲 *@${senderJid.split('@')[0]}* a tiré **[ ${deResultat} ]** ! 🎉 QUALIFIÉ !`, mentions: [senderJid] }, { quoted: msg });
            } else {
              await envoyerAvecDelai(sock, remoteJid, { text: `🎲 *@${senderJid.split('@')[0]}* a tiré **[ ${deResultat} ]** ! (Cible: ${jeuEnCours.objectif}) - Raté.`, mentions: [senderJid] }, { quoted: msg });
            }

            let nonQualifies = jeuEnCours.joueurs.filter(j => !jeuEnCours.qualifies.includes(j));
            if (nonQualifies.length === 1 && jeuEnCours.joueurs.length > 1) {
              const elimine = nonQualifies[0];
              jeuEnCours.joueurs = jeuEnCours.joueurs.filter(j => j.jid !== elimine.jid);
              jeuEnCours.qualifies = [];

              if (jeuEnCours.joueurs.length === 1) {
                const gagnant = jeuEnCours.joueurs[0];
                await terminerManche(remoteJid, sock, `💀 *@${elimine.jid.split('@')[0]}* ÉLIMINÉ !\n\n🏆 *VAINQUEUR : @${gagnant.jid.split('@')[0]} !* 🎉`);
                return;
              }

              jeuEnCours.manche += 1;
              jeuEnCours.objectif = OBJECTIFS_DE[Math.floor(Math.random() * OBJECTIFS_DE.length)];
              jeuEnCours.tourIndex = 0;
              await envoyerAvecDelai(sock, remoteJid, { text: `💀 *@${elimine.jid.split('@')[0]}* ÉLIMINÉ !\n\n🔄 *MANCHE ${jeuEnCours.manche} !*\n🎯 Objectif : **[ ${jeuEnCours.objectif} ]** !` });
              return;
            }

            let chercheProchain = true;
            while (chercheProchain) {
              jeuEnCours.tourIndex = (jeuEnCours.tourIndex + 1) % jeuEnCours.joueurs.length;
              const pro = jeuEnCours.joueurs[jeuEnCours.tourIndex];
              if (!jeuEnCours.qualifies.includes(pro)) chercheProchain = false;
            }

            const prochainJoueur = jeuEnCours.joueurs[jeuEnCours.tourIndex];
            await envoyerAvecDelai(sock, remoteJid, { text: `🎯 Tour de : *@${prochainJoueur.jid.split('@')[0]}*\n👉 Tapez *@lancer* !`, mentions: [prochainJoueur.jid] });
          }
          return;
        }

        // 🦑 3. SQUID GAME
        if (jeuEnCours.type === 'SQUID_GAME') {
          const joueurActuel = jeuEnCours.joueurs[jeuEnCours.tourIndex];
          if (joueurActuel.jid !== senderJid) return;

          if (jeuEnCours.enAttenteReponse) {
            if (action === jeuEnCours.motAttendu) {
              clearTimeout(jeuEnCours.timerSquid);
              jeuEnCours.enAttenteReponse = false;
              await envoyerAvecDelai(sock, remoteJid, { text: `✅ *SAUVÉ !* *@${senderJid.split('@')[0]}* franchit la ligne !`, mentions: [senderJid] }, { quoted: msg });
              jeuEnCours.tourIndex = (jeuEnCours.tourIndex + 1) % jeuEnCours.joueurs.length;
              setTimeout(() => lancerTourSquidGame(sock, remoteJid), 2500);
            } else {
              clearTimeout(jeuEnCours.timerSquid);
              jeuEnCours.enAttenteReponse = false;
              const cinematique = CINEMATIQUES_ELIMINATION[Math.floor(Math.random() * CINEMATIQUES_ELIMINATION.length)];
              jeuEnCours.joueurs.splice(jeuEnCours.tourIndex, 1);
              if (jeuEnCours.joueurs.length > 0) jeuEnCours.tourIndex = jeuEnCours.tourIndex % jeuEnCours.joueurs.length;
              await envoyerAvecDelai(sock, remoteJid, { text: `💥 ERREUR !\n${cinematique}\n💀 *@${joueurActuel.jid.split('@')[0]}* ÉLIMINÉ !`, mentions: [joueurActuel.jid] });
              setTimeout(() => lancerTourSquidGame(sock, remoteJid), 2500);
            }
          }
          return;
        }

        // 💀 4. ROULETTE RUSSE
        if (jeuEnCours.type === 'ROULETTE_ULTIMATE') {
          if (action === 'tirer' || action === 'pan') {
            jeuEnCours.essais += 1;
            if (jeuEnCours.chambreBalle === jeuEnCours.chambreActuelle) {
              await terminerManche(remoteJid, sock, `💥 *BOOOOOOOM ! PAN !* 💥\n💀 *@${senderJid.split('@')[0]}* ÉLIMINÉ au tir N°${jeuEnCours.essais} !`);
            } else {
              jeuEnCours.chambreActuelle += 1;
              await envoyerAvecDelai(sock, remoteJid, { text: `📄 *CLIC !* Balle à blanc (${jeuEnCours.essais}/6) !\n🎉 @${senderJid.split('@')[0]} survit !\n👉 Suivant : *@tirer* ou *@tourner* !` }, { quoted: msg });
            }
          } else if (action === 'tourner') {
            jeuEnCours.chambreActuelle = Math.floor(Math.random() * 6) + 1;
            await envoyerAvecDelai(sock, remoteJid, { text: `🔄 Barillet tourné ! Envoyez *@tirer* !` }, { quoted: msg });
          }
          return;
        }

        // 🔢 5. CHIFFRE MYSTÈRE
        if (jeuEnCours.type === 'CHIFFRE_MYSTERE') {
          const num = parseInt(action, 10);
          if (!isNaN(num)) {
            if (num === jeuEnCours.solution) {
              await terminerManche(remoteJid, sock, `🏆 *BRAVO @${senderJid.split('@')[0]} !* Nombre trouvé : **${num}** ! 🎉`);
            } else if (num < jeuEnCours.solution) {
              await envoyerAvecDelai(sock, remoteJid, { text: `📈 Plus grand que ${num} !` }, { quoted: msg });
            } else {
              await envoyerAvecDelai(sock, remoteJid, { text: `📉 Plus petit que ${num} !` }, { quoted: msg });
            }
          }
          return;
        }

        // 🎯 6. CHASSE EMOJI
        if (jeuEnCours.type === 'CHASSE_EMOJI') {
          if (action === jeuEnCours.cible.toLowerCase()) {
            await terminerManche(remoteJid, sock, `🏆 *BRAVO @${senderJid.split('@')[0]} !* Emoji trouvé : **${jeuEnCours.cible}** ! 🎉`);
          }
          return;
        }
      }

      // ----------------------------------------------------
      // 🔄 CONTRÔLE DE PARTIE (.jouer / .stop)
      // ----------------------------------------------------
      if (lowerText === '.jouer') {
        if (!jeuEnCours) {
          await envoyerAvecDelai(sock, remoteJid, { text: "⚠️ Aucun salon ouvert." }, { quoted: msg });
          return;
        }

        if (jeuEnCours.statut === 'INSCRIPTION') {
          if (jeuEnCours.joueurs.length === 0 && jeuEnCours.type !== 'LABYRINTHE_SOLO') {
            await envoyerAvecDelai(sock, remoteJid, { text: "⚠️ Au moins 1 joueur doit s'inscrire avec **.inscrire** !" }, { quoted: msg });
            return;
          }

          jeuEnCours.statut = 'EN_COURS';
          jeuEnCours.manche += 1;
          demarrerTimerInactivite(sock, remoteJid);

          if (jeuEnCours.type.startsWith('LABYRINTHE')) {
            const envKey = jeuEnCours.choixEnv || 'ocean';
            const donjon = ENVIRONNEMENTS_LABYRINTHE[envKey] || ENVIRONNEMENTS_LABYRINTHE['ocean'];
            
            jeuEnCours.donjon = donjon;
            jeuEnCours.etapeIndex = 0;
            jeuEnCours.hp = 100;
            jeuEnCours.joueurActif = choisirJoueurAleatoire(jeuEnCours.joueurs);

            const TEMPS_LIMITE_MS = 5 * 60 * 1000;
            jeuEnCours.timerChronoLabyrinthe = setTimeout(async () => {
              if (partiesEnCours[remoteJid] && partiesEnCours[remoteJid].statut === 'EN_COURS') {
                await terminerManche(remoteJid, sock, `🚨 *TEMPS ÉCOULÉ / LIMITE DE 5 MIN PASSÉE !*\n${donjon.mortMessage}`);
              }
            }, TEMPS_LIMITE_MS);

            await envoyerAvecDelai(sock, remoteJid, { 
              text: `⏱️ *CHRONO DE SURVIE ENCLENCHÉ (5 MINUTES MAX) !*\n📍 Lieu : **${donjon.nom}**\n🩸 Oxygène/Santé initiale : **100%**\n🎯 Premier tour : *@${jeuEnCours.joueurActif.jid.split('@')[0]}* (${jeuEnCours.joueurActif.pseudo})\n\n${donjon.etapes[0].desc}`,
              mentions: [jeuEnCours.joueurActif.jid]
            });
            return;
          }

          if (jeuEnCours.type === 'DE_BATTLE') {
            jeuEnCours.objectif = OBJECTIFS_DE[Math.floor(Math.random() * OBJECTIFS_DE.length)];
            jeuEnCours.tourIndex = 0;
            jeuEnCours.qualifies = [];
            await envoyerAvecDelai(sock, remoteJid, { text: `🎲 *DÉ BATTLE ROYALE !*\n🎯 Objectif : **[ ${jeuEnCours.objectif} ]** !\n👉 *@${jeuEnCours.joueurs[0].jid.split('@')[0]}* à toi de lancer (*@lancer*) !`, mentions: jeuEnCours.joueurs.map(j => j.jid) });
            return;
          }

          if (jeuEnCours.type === 'SQUID_GAME') {
            jeuEnCours.tourIndex = 0;
            await envoyerAvecDelai(sock, remoteJid, { text: `🦑 *SQUID GAME DÉMARRÉ !*` });
            setTimeout(() => lancerTourSquidGame(sock, remoteJid), 2500);
            return;
          }
        }

        if (jeuEnCours.statut === 'ATTENTE_RELANCE') {
          jeuEnCours.statut = 'INSCRIPTION';
          jeuEnCours.joueurs = [];
          jeuEnCours.qualifies = [];
          await envoyerAvecDelai(sock, remoteJid, { text: `🔄 *SALON RELANCÉ !* Inscrivez-vous avec **.inscrire** puis tapez **.jouer** !` });
        }
        return;
      }

      if (lowerText === '.stop') {
        if (jeuEnCours) {
          reinitialiserJeu(remoteJid);
          await envoyerAvecDelai(sock, remoteJid, { text: "🛑 *Partie stoppée et mémoire vidée !*" }, { quoted: msg });
        } else {
          await envoyerAvecDelai(sock, remoteJid, { text: "⚠️ Aucun jeu en cours." }, { quoted: msg });
        }
        return;
      }

      // ----------------------------------------------------
      // 📜 MENU PRINCIPAL (.menu)
      // ----------------------------------------------------
      if (lowerText === '.menu' || lowerText === 'menu') {
        const menuText = `
🤖 *TITAN BOT - SURVIE & COMMANDES* 🤖

👁️ *OUTILS UTILES*
├── 🔓 *.vv* → Débloque les vues uniques
├── 📸 *.pp* → Photo de profil
└── 📱 *.qr* [texte/lien] → Générateur de Code QR

🎮 *JEUX DE SURVIE & MULTIJOUEURS*
├── 🌊 *.labyrinthe ocean* → Abysses & réserve d'oxygène (5 min)
├── 🚀 *.labyrinthe espace* → Station spatiale & asphyxie (5 min)
├── 🏛️ *.labyrinthe donjon* → Minotaure classique (5 min)
├── 🏜️ *.labyrinthe temple* → Pyramide & pièges toxiques (5 min)
├── 🎲 *.de* → Battle Royale de Dé
├── 🦑 *.squidgame* → Feu Rouge / Feu Vert
├── 💀 *.roulette* → Roulette Russe
├── 🔢 *.chiffremystere* → Deviner le nombre
└── 🎯 *.chasse-emoji* → Réflexe Emoji

⚙️ *GESTION SALON*
├── ✍️ *.inscrire* [pseudo] → Rejoindre la session
├── 🚀 *.jouer* → Lancer la partie
└── 🛑 *.stop* → Annuler et réinitialiser`;

        await envoyerAvecDelai(sock, remoteJid, { text: menuText }, { quoted: msg });
        return;
      }

      // ----------------------------------------------------
      // 🎮 DÉCLENCHEMENT DES JEUX
      // ----------------------------------------------------
      if (lowerText.startsWith('.labyrinthe')) {
        const mode = cleanText.split(" ")[1]?.toLowerCase();
        if (!mode || !ENVIRONNEMENTS_LABYRINTHE[mode]) {
          await envoyerAvecDelai(sock, remoteJid, { 
            text: "🌀 *CHOISIS TON ENVIRONNEMENT DE SURVIE (CHRONO 5 MIN) :*\n1️⃣ **.labyrinthe ocean** (Profondeurs & Noyade)\n2️⃣ **.labyrinthe espace** (Vaisseau & Panne d'Oxygène)\n3️⃣ **.labyrinthe donjon** (Pièges & Minotaure)\n4️⃣ **.labyrinthe temple** (Gaz toxique & Scorpions)" 
          }, { quoted: msg });
          return;
        }

        reinitialiserJeu(remoteJid);
        partiesEnCours[remoteJid] = { 
          type: 'LABYRINTHE_SURVIE', 
          choixEnv: mode, 
          statut: 'INSCRIPTION', 
          manche: 0, 
          joueurs: [] 
        };
        demarrerTimerInactivite(sock, remoteJid);
        await envoyerAvecDelai(sock, remoteJid, { 
          text: `🚨 *SALON DE SURVIE OUVERT [Thème : ${ENVIRONNEMENTS_LABYRINTHE[mode].nom}] !*\n⏱️ Temps limite : **5 minutes** avant asphyxie/écrasement !\n\n👉 Tapez **.inscrire** pour rejoindre puis **.jouer** !` 
        }, { quoted: msg });
        return;
      }

      if (lowerText.startsWith('.de')) {
        reinitialiserJeu(remoteJid);
        partiesEnCours[remoteJid] = { type: 'DE_BATTLE', statut: 'INSCRIPTION', manche: 0, joueurs: [], qualifies: [], tourIndex: 0 };
        demarrerTimerInactivite(sock, remoteJid);
        await envoyerAvecDelai(sock, remoteJid, { text: `🎲 *SALON DÉ BATTLE ROYALE OUVERT !*\n👉 **.inscrire** puis **.jouer** !` }, { quoted: msg });
        return;
      }

      if (lowerText === '.squidgame' || lowerText === '.feurouge') {
        reinitialiserJeu(remoteJid);
        partiesEnCours[remoteJid] = { type: 'SQUID_GAME', statut: 'INSCRIPTION', manche: 0, joueurs: [], tourIndex: 0, enAttenteReponse: false };
        demarrerTimerInactivite(sock, remoteJid);
        await envoyerAvecDelai(sock, remoteJid, { text: `🦑 *SALON SQUID GAME OUVERT !*\n👉 **.inscrire** puis **.jouer** !` }, { quoted: msg });
        return;
      }

      if (lowerText === '.roulette') {
        reinitialiserJeu(remoteJid);
        partiesEnCours[remoteJid] = { type: 'ROULETTE_ULTIMATE', statut: 'EN_COURS', manche: 1, chambreBalle: Math.floor(Math.random() * 6) + 1, chambreActuelle: 1, essais: 0 };
        demarrerTimerInactivite(sock, remoteJid);
        await envoyerAvecDelai(sock, remoteJid, { text: `💀 *ROULETTE RUSSE CHARGÉE !*\n👉 Tente ta chance avec *@tirer* ou *@tourner* !` }, { quoted: msg });
        return;
      }

      if (lowerText === '.chiffremystere') {
        reinitialiserJeu(remoteJid);
        const secret = Math.floor(Math.random() * 100) + 1;
        partiesEnCours[remoteJid] = { type: 'CHIFFRE_MYSTERE', statut: 'EN_COURS', solution: secret, manche: 1 };
        demarrerTimerInactivite(sock, remoteJid);
        await envoyerAvecDelai(sock, remoteJid, { text: `🔢 *CHIFFRE MYSTÈRE !* Devine le nombre entre 1 et 100 avec **@** (ex: *@50*) !` }, { quoted: msg });
        return;
      }

      if (lowerText === '.chasse-emoji') {
        reinitialiserJeu(remoteJid);
        const emoji = EMOJIS_DICO[Math.floor(Math.random() * EMOJIS_DICO.length)];
        partiesEnCours[remoteJid] = { type: 'CHASSE_EMOJI', statut: 'EN_COURS', cible: emoji, manche: 1 };
        demarrerTimerInactivite(sock, remoteJid);
        await envoyerAvecDelai(sock, remoteJid, { text: `🎯 *CHASSE À L'EMOJI !* Renvoyez vite **@${emoji}** !` }, { quoted: msg });
        return;
      }

    } catch (err) {
      console.error("Erreur globale :", err);
    }
  });
}

startBot();
