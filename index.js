const express = require("express");
const http = require("http");
const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// 1. SERVEUR WEB & KEEP-ALIVE 24/7 (RENDER)
// ==========================================
app.get("/", (req, res) => {
  res.send("🤖 BOT TITAN ULTIMATE EST ACTIF ET EN LIGNE 24/7 !");
});

app.listen(PORT, () => {
  console.log(`🌐 Serveur Web actif sur le port ${PORT}`);
});

// Relance automatique pour éviter la mise en veille sur Render
setInterval(() => {
  const renderUrl = process.env.RENDER_EXTERNAL_URL;
  if (renderUrl) {
    http.get(renderUrl, (res) => {
      console.log(`⏰ Keep-Alive - Status: ${res.statusCode}`);
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
  downloadContentFromMessage,
  delay
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const googleTTS = require('google-tts-api');

// ==========================================
// 🧠 BASES DE DONNÉES EN MÉMOIRE (RAM)
// ==========================================
const userState = {};      // VIP & Mots de passe
const antilinkGroups = {}; // Anti-link par groupe
const warnDatabase = {};   // Base des avertissements
const mariagesDB = {};     // Mariages virtuels
const xpDatabase = {};     // Expérience & Niveaux
const cooldowns = {};      // Anti-spam par commande
const partiesEnCours = {}; // Salons de jeux multijoueurs actifs

// Dictionnaires de données pour mini-jeux
const EMOJIS_DICO = ["🦁", "🍕", "🚀", "👑", "⚽", "🎮", "🎸", "🥑", "💎", "🔥", "🦄", "🎯", "🤖", "👻", "🌮", "🐉", "🍔", "🏆", "🎨", "🎰"];
const MOTS_RIME = ["Soleil", "Amour", "Château", "Maison", "Jardin", "Voyage", "Sourire", "Fleur", "Ciel", "Nuage"];
const CAPITALES_DICO = [
  { pays: "France", capitale: "Paris" },
  { pays: "Côte d'Ivoire", capitale: "Yamoussoukro" },
  { pays: "Japon", capitale: "Tokyo" },
  { pays: "Espagne", capitale: "Madrid" },
  { pays: "Brésil", capitale: "Brasilia" },
  { pays: "Canada", capitale: "Ottawa" }
];
const ENIGMES = [
  { q: "Qu'est-ce qui a des clés mais ne peut pas ouvrir de serrures ?", r: "un piano" },
  { q: "Plus j'en ai, moins on en voit. Que suis-je ?", r: "l'obscurité" },
  { q: "Je parle toutes les langues sans avoir de bouche. Que suis-je ?", r: "l'écho" }
];
const CITATIONS_MANGA = [
  "« Si tu n'aimes pas ton destin, ne l'accepte pas. Aie le courage de le changer ! » — Naruto Uzumaki",
  "« Les gens meurent quand ils sont tués. » — Shirou Emiya",
  "« Si tu gagnes, tu vis. Si tu perds, tu meurs. Si tu ne te bats pas, tu ne peux pas gagner ! » — Eren Yeager"
];

// ==========================================
// ⚙️ FONCTIONS UTILITAIRES & NETTOYAGE
// ==========================================
function reinitialiserJeu(groupId) {
  if (partiesEnCours[groupId]) {
    if (partiesEnCours[groupId].timer) clearTimeout(partiesEnCours[groupId].timer);
    delete partiesEnCours[groupId];
  }
}

function demarrerTimerInactivite(sock, groupId) {
  if (partiesEnCours[groupId]?.timer) clearTimeout(partiesEnCours[groupId].timer);
  
  partiesEnCours[groupId].timer = setTimeout(async () => {
    delete partiesEnCours[groupId];
    await sock.sendMessage(groupId, { text: "🧹 *Nettoyage RAM :* Salon de jeu fermé automatiquement pour inactivité (2 minutes)." });
  }, 2 * 60 * 1000);
}

function verifierCooldown(jid, commande, tempsEnSecondes = 4) {
  const clef = `${jid}_${commande}`;
  const maintenant = Date.now();
  if (cooldowns[clef] && maintenant - cooldowns[clef] < tempsEnSecondes * 1000) {
    return false;
  }
  cooldowns[clef] = maintenant;
  return true;
}

// ==========================================
// 🔌 DÉMARRAGE DU BOT TITAN
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

  // Gestion du Pair Code pour connexion WhatsApp
  if (!sock.authState.creds.registered) {
    const phoneNumber = process.env.PHONE_NUMBER || "2250141606159";
    setTimeout(async () => {
      try {
        let code = await sock.requestPairingCode(phoneNumber.replace(/[^0-9]/g, ""));
        code = code?.match(/.{1,4}/g)?.join("-") || code;
        console.log("\n================================================");
        console.log(`👉 CODE DE JUMELAGE : ${code}`);
        console.log("================================================\n");
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
      console.log('🟢 BOT TITAN ULTIMATE OPÉRATIONNEL SUR WHATSAPP !');
    }
  });

  // ==========================================
  // 📩 TRAITEMENT DE CHACUN DES MESSAGES
  // ==========================================
  sock.ev.on('messages.upsert', async (m) => {
    try {
      const msg = m.messages[0];
      if (!msg || !msg.message || msg.key.fromMe) return;

      const remoteJid = msg.key.remoteJid;
      const senderJid = msg.key.participant || msg.key.remoteJid;
      const isGroup = remoteJid.endsWith('@g.us');

      const textMessage = msg.message.conversation || 
                          msg.message.extendedTextMessage?.text || 
                          msg.message.imageMessage?.caption || "";

      const cleanText = textMessage.trim();
      const lowerText = cleanText.toLowerCase();

      await sock.sendPresenceUpdate('composing', remoteJid);

      // 🛡️ MODÉRATION AUTOMATIQUE : Anti-Lien
      if (isGroup && antilinkGroups[remoteJid]) {
        if (cleanText.includes("chat.whatsapp.com/") || cleanText.includes("http://") || cleanText.includes("https://")) {
          await sock.sendMessage(remoteJid, { delete: msg.key });
          await sock.sendMessage(remoteJid, { text: `⚠️ @${senderJid.split('@')[0]}, les liens sont interdits ici !`, mentions: [senderJid] });
          return;
        }
      }

      // ----------------------------------------------------
      // 🎯 FILTRE ANTI-INTERFÉRENCE : REPONSES AVEC @
      // ----------------------------------------------------
      const partieActive = partiesEnCours[remoteJid];

      if (partieActive && partieActive.statut === 'EN_COURS') {
        const estUnReponseJeu = cleanText.startsWith('@');
        const estUneCommande = cleanText.startsWith('.');

        // Si ce n'est ni une réponse de jeu avec @ ni une commande avec ., on laisse la discussion normale
        if (!estUnReponseJeu && !estUneCommande) {
          return;
        }

        // Si l'utilisateur tente de répondre au jeu via @
        if (estUnReponseJeu) {
          const tentativeReponse = cleanText.substring(1).trim().toLowerCase();

          // Vérification selon le type de jeu actif
          if (partieActive.type === 'CHASSE A L\'EMOJI') {
            if (tentativeReponse === partieActive.cible.toLowerCase()) {
              reinitialiserJeu(remoteJid);
              await sock.sendMessage(remoteJid, {
                text: `🏆 *BRAVO @${senderJid.split('@')[0]} !* Tu as trouvé l'emoji : **${partieActive.cible}** ! 🎉`,
                mentions: [senderJid]
              }, { quoted: msg });
              return;
            } else {
              await sock.sendMessage(remoteJid, { text: `❌ *@${senderJid.split('@')[0]}*, ce n'est pas le bon emoji !` }, { quoted: msg });
              return;
            }
          }

          if (partieActive.type === 'CHIFFRE MYSTÈRE') {
            const num = parseInt(tentativeReponse, 10);
            if (isNaN(num)) return;

            if (num === partieActive.nombre) {
              reinitialiserJeu(remoteJid);
              await sock.sendMessage(remoteJid, {
                text: `🎉 *VICTOIRE DE @${senderJid.split('@')[0]} !* Le chiffre mystère était bien **${partieActive.nombre}** !`,
                mentions: [senderJid]
              }, { quoted: msg });
              return;
            } else if (num < partieActive.nombre) {
              await sock.sendMessage(remoteJid, { text: `📈 C'est *PLUS GRAND* que ${num} !` }, { quoted: msg });
              return;
            } else {
              await sock.sendMessage(remoteJid, { text: `📉 C'est *PLUS PETIT* que ${num} !` }, { quoted: msg });
              return;
            }
          }
        }
      }

      // 🔐 CODE SECRET DE DÉVERROUILLAGE ASHLEY (.secret)
      if (userState[senderJid] === 'WAITING_SECRET_PASSWORD') {
        if (cleanText === '@Ashlyey' || lowerText === '@ashlyey') {
          delete userState[senderJid];
          const secretMessage = `Ashley tu ne sais pas à quel point je suis content 🙂 que tu sois là 😌🤩
T'a mm réussi à déverrouiller le mot de passe🔐 
En vrai c'était facile il a juste demander ton identité🪪 
Bref je vais aller droit au but😯💨 Andy que tu connais là mais purée il a changé de ouf😵‍💫😢 c'est un OBSÉDÉ 
Je t'assure il est gravé obsédé🧟 en mode obsession niveau max ça veut peter💥 même,mais par qui🧍🏼‍♀️ est il obsédé ? 🧐
Humm... Ashley si tu es entrain de lire ce message c'est pas par hasard 🎲
Enfaite ce message t'étais déjà destinée🔮 en vrai Andy il est obsédé par toi oui toi Ashley 🫵🏼 orhh arrête de regarder à gauche ou à droite je parle bien de toi 🫵🏼 Humm... Il est obsédé par toi tu hantes ses pensées de ouf 😌💭👸🏼👸🏼 et même qu'il est amoureux de toi 😍 il pense que t'es ça reine 👸🏼 son honey 😍 sa copine 👥❤️
Bon c'est ce que je sais ohh faut pas lui dire que c'est moi je t'ai montré hyn 
Att 2 secondes imagine tu lis ça et toi mm tu le savais déjà ou b lui mm il t'avait déjà dit ça,ça allait être b sur moi hyn 😂 
Heureusement que tu sais pas hyn 😂 enfin je pense 🤔
Pour vue qu'elle ne le sache pas ohh 😬`;
          await sock.sendMessage(remoteJid, { text: secretMessage }, { quoted: msg });
        } else {
          await sock.sendMessage(remoteJid, { text: "❌ *Mot de passe incorrect.* Tapez `.secret` pour réessayer." }, { quoted: msg });
          delete userState[senderJid];
        }
        return;
      }

      // 👋 ACCUEIL & SALUTATIONS
      const salutations = ["bonjour", "salut", "coucou", "hello", "hey", "bonsoir", "slt"];
      if (salutations.includes(lowerText)) {
        const discoursAcc = `👋 *Bonjour @${senderJid.split('@')[0]} ! Comment tu vas ?*

🤖 Je suis **TITAN**, ton assistant virtuel multifonction ! Je suis là pour animer le groupe avec plein de mini-jeux et t'aider au quotidien.

📌 *Pour découvrir toutes mes fonctionnalités, tapez :*
👉 **.menu**`;

        await sock.sendMessage(remoteJid, { text: discoursAcc, mentions: [senderJid] }, { quoted: msg });
        return;
      }

      // ----------------------------------------------------
      // ✍️ SYSTEME D'INSCRIPTION GENERIQUE DE SALON
      // ----------------------------------------------------
      if (lowerText.startsWith('.inscrire') || lowerText.startsWith('.rejoindre')) {
        if (!partiesEnCours[remoteJid] || (partiesEnCours[remoteJid].statut !== 'INSCRIPTION' && partiesEnCours[remoteJid].statut !== 'ATTENTE_MANCHE')) {
          await sock.sendMessage(remoteJid, { text: "⚠️ Aucun salon ouvert. Lancez d'abord un jeu !" }, { quoted: msg });
          return;
        }

        const args = cleanText.split(" ");
        const pseudo = args[1];

        if (!pseudo || pseudo.length < 2 || pseudo.length > 6) {
          await sock.sendMessage(remoteJid, { text: "⚠️ *Format invalide !* Saisissez un surnom de **2 à 6 lettres**.\nExemple : `.inscrire Alex`" }, { quoted: msg });
          return;
        }

        const existe = partiesEnCours[remoteJid].joueurs.find(j => j.jid === senderJid);
        if (!existe) {
          partiesEnCours[remoteJid].joueurs.push({ jid: senderJid, pseudo: pseudo.toUpperCase() });
          demarrerTimerInactivite(sock, remoteJid);

          let listePseudos = partiesEnCours[remoteJid].joueurs.map((j, i) => `${i + 1}. *${j.pseudo}* (@${j.jid.split('@')[0]})`).join("\n");
          await sock.sendMessage(remoteJid, { 
            text: `✅ *${pseudo.toUpperCase()}* inscrit avec succès !\n\n👥 *Joueurs dans le salon :*\n${listePseudos}\n\nTapez \`.jouer\` quand vous êtes prêts !`,
            mentions: partiesEnCours[remoteJid].joueurs.map(j => j.jid)
          }, { quoted: msg });
        } else {
          await sock.sendMessage(remoteJid, { text: `⚠️ Vous êtes déjà inscrit sous le nom de *${existe.pseudo}* !` }, { quoted: msg });
        }
        return;
      }

      // ----------------------------------------------------
      // 🚀 COMMANDES DE CONTROLE DES MANCHES (.JOUER & .STOP)
      // ----------------------------------------------------
      if (lowerText === '.jouer') {
        if (!partiesEnCours[remoteJid]) {
          await sock.sendMessage(remoteJid, { text: "⚠️ Aucune partie n'est actuellement ouverte." }, { quoted: msg });
          return;
        }

        const party = partiesEnCours[remoteJid];

        if (party.joueurs.length === 0) {
          await sock.sendMessage(remoteJid, { text: "⚠️ Salon vide. Inscrivez-vous avec `.inscrire <surnom>` !" }, { quoted: msg });
          return;
        }

        // Mode Spécifique : Labyrinthe Duel
        if (party.type === 'LABYRINTHE_DUEL') {
          if (party.joueurs.length < 2) {
            await sock.sendMessage(remoteJid, { text: "⚠️ Le mode Duel nécessite au moins **2 joueurs** !" }, { quoted: msg });
            return;
          }

          party.statut = 'EN_COURS';
          party.manche += 1;
          demarrerTimerInactivite(sock, remoteJid);

          const joueursMelanges = [...party.joueurs].sort(() => Math.random() - 0.5);
          const mid = Math.ceil(joueursMelanges.length / 2);
          const equipeA = joueursMelanges.slice(0, mid);
          const equipeB = joueursMelanges.slice(mid);

          let msgDuel = `🌀⚔️ *LABYRINTHE MODE DUEL - MANCHE ${party.manche}*\n\n`;
          msgDuel += `🔴 *ÉQUIPE A :*\n` + equipeA.map(j => `• *${j.pseudo}* (@${j.jid.split('@')[0]})`).join("\n") + "\n\n";
          msgDuel += `🔵 *ÉQUIPE B :*\n` + equipeB.map(j => `• *${j.pseudo}* (@${j.jid.split('@')[0]})`).join("\n") + "\n\n";
          msgDuel += `💡 *CONSIGNE :* Répondez au jeu en mettant **@** devant (ex: *@nord*). Vous pouvez discuter librement !`;

          await sock.sendMessage(remoteJid, { text: msgDuel, mentions: party.joueurs.map(j => j.jid) });

          setTimeout(async () => {
            if (partiesEnCours[remoteJid]) {
              partiesEnCours[remoteJid].statut = 'ATTENTE_MANCHE';
              await sock.sendMessage(remoteJid, { text: `🏁 *FIN DE LA MANCHE !*\nTapez **.jouer** pour rejouer ou **.stop** pour quitter.` });
            }
          }, 15000);
          return;
        }

        // Lancement standard de manche
        party.statut = 'EN_COURS';
        party.manche += 1;
        demarrerTimerInactivite(sock, remoteJid);

        const joueursMelanges = [...party.joueurs].sort(() => Math.random() - 0.5);

        let introMsg = `🎮 *MANCHE N°${party.manche} (${party.type}) DÉMARRÉE !*\n\n`;
        introMsg += `🎲 *Ordre de passage :*\n`;
        joueursMelanges.forEach((j, index) => {
          introMsg += `${index + 1}. *${j.pseudo}* (@${j.jid.split('@')[0]})\n`;
        });
        introMsg += `\n💡 *CONSIGNE :* Mettez **@** devant vos réponses (ex: *@reponse*). Les messages normaux du groupe seront ignorés par le bot !`;

        await sock.sendMessage(remoteJid, { text: introMsg, mentions: joueursMelanges.map(j => j.jid) });

        setTimeout(async () => {
          if (partiesEnCours[remoteJid]) {
            partiesEnCours[remoteJid].statut = 'ATTENTE_MANCHE';
            let finMsg = `🏁 *FIN DE LA MANCHE ${partiesEnCours[remoteJid].manche} !*\n\n`;
            finMsg += `👉 Tapez **.jouer** pour relancer la manche suivante !\n`;
            finMsg += `👉 Tapez **.stop** pour fermer la partie.`;
            await sock.sendMessage(remoteJid, { text: finMsg });
          }
        }, 15000);

        return;
      }

      if (lowerText === '.stop') {
        if (partiesEnCours[remoteJid]) {
          const total = partiesEnCours[remoteJid].manche;
          reinitialiserJeu(remoteJid);
          await sock.sendMessage(remoteJid, { text: `🛑 *Partie arrêtée après ${total} manche(s) !* Mémoire nettoyée.` }, { quoted: msg });
        } else {
          await sock.sendMessage(remoteJid, { text: "⚠️ Aucun salon actif à stopper." }, { quoted: msg });
        }
        return;
      }

      // ----------------------------------------------------
      // 📜 MENU GÉNÉRAL COMPLET
      // ----------------------------------------------------
      if (lowerText === '.menu' || lowerText === 'menu') {
        const menuText = `
😏 *JE SUIS TITAN LE BOT ULTIMATE* 😏
───────────────────
👤 *Utilisateur :* @${senderJid.split('@')[0]}
🌐 *Statut Bot :* En ligne 24/7 🟢
───────────────────

🌀 *ESPACE LABYRINTHE*
├── 👤 *.labyrinthe solo* → Mode Individuel
├── 👥 *.labyrinthe equipe* → Mode Salon d'Équipe
└── ⚔️ *.labyrinthe duel* → Mode Duel (Équipe A vs Équipe B)

🎯 *MINI-JEUX & SALONS DE GROUPE*
├── 🔤 *.bac* → Jeu du Baccalauréat
├── 🎯 *.chasse-emoji* → Chasse à l'Emoji
├── 🧗 *.escalade* → Escalade de Groupe
├── 💣 *.bombe* → Jeu de la Bombe
├── 🔐 *.escapegame* → Escape Game
├── 🎵 *.rime* → Jeu des Rimes
├── 🕵️ *.intrus* → Trouver l'Intrus
├── 🔢 *.chiffremystere* → Le Nombre Mystère
├── ⚔️ *.duel* → Affrontement Direct
├── ❓ *.enigme* → Énigme de Réfléxion
├── 📝 *.vraioufaux* → Quiz Vrai ou Faux
├── 💀 *.roulette* → Roulette Russe
├── 🔮 *.8ball* → Boule de Cristal
├── ✂️ *.pfc* → Pierre Feuille Ciseaux
├── 🏛️ *.capitales* → Jeu des Capitales
├── 🪙 *.pileface* → Pile ou Face
├── 🎲 *.de* → Lancer un Dé
├── 🤫 *.verdad* → Action ou Vérité
├── 💥 *.clash* → Générateur de Clash
├── 📜 *.citation* → Citation Inspiration
├── 😂 *.blague* → Blague Aléatoire
├── ❤️ *.compatibilite* → Test de Compatibilité
├── 🎰 *.slots* → Machine à Sous
└── ⛩️ *.citationmanga* → Citations Anime/Manga

📌 *Gestion des Salons :*
├── ✍️ *.inscrire <surnom>* → S'inscrire (2-6 lettres)
├── 🚀 *.jouer* → Lancer la Manche
└── 🛑 *.stop* → Arrêter le Salon

🛡️ *ADMINISTRATION & MODÉRATION*
├── 📢 *.tagall* → Mentionner Tous les Membres
├── 🚪 *.kick* → Expulser un Membre
├── 🚫 *.ban* → Bannir un Membre
├── 🔇 *.mute* → Fermer le Groupe
├── 🔊 *.unmute* → Ouvrir le Groupe
├── 🔗 *.link* → Obtenir le Lien du Groupe
└── 🔒 *.antilink* → Activer Anti-Lien

🎨 *UTILITAIRES & MÉDIAS*
├── 👁️ *.vu* → Débloquer Message Vue Unique
├── 📸 *.pp* → Télécharger Photo de Profil
├── 🗣️ *.tts <texte>* → Conversion Texte en Vocal
├── 🔲 *.qr <texte>* → Générateur de QR Code
└── ⚡ *.ping* → Tester la Vitesse du Bot

💍 *ÉCONOMIE & PROFILS*
├── 📊 *.compte* / *.profil* → Statut & XP
├── 💒 *.marry* → Mariage Virtuel
└── 💔 *.divorce* → Divorce Virtuel

👑 *ZONE SECRET VIP*
└── 🔐 *.secret* → Le Secret d'Andy

💡 *ASTUCE JEU :* En partie, mettez toujours **@** devant votre réponse (ex: *@paris*) pour que le bot la prenne en compte ! Vous pouvez parler normalement sans gêner le jeu.`;

        await sock.sendMessage(remoteJid, { text: menuText, mentions: [senderJid] }, { quoted
