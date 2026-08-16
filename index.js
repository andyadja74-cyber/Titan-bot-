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
const ytdl = require('ytdl-core');
const google = require('google-it');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// 🔗 IMPORTATION DE TOUTES LES BANQUES DE DONNÉES (data.js)
const {
  COMMENTAIRES_LOVE,
  CITATIONS,
  LISTE_ANIMAUX,
  MOTS_SQUID,
  partiesEnCours,
  timersInactivite,
  vueUniqueCache,
  animauxJoueurs
} = require('./data');

// ==========================================
// 🤖 INITIALISATION GEMINI IA
// ==========================================
const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenerativeAI(apiKey) : null;
const model = ai ? ai.getGenerativeModel({ model: "gemini-1.5-flash" }) : null;

async function genererReponseGemini(prompt) {
  if (!model) {
    return "⚠️ La variable GEMINI_API_KEY n'est pas configurée dans l'onglet Environment sur Render.";
  }
  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("Erreur API Gemini :", error.message || error);
    return "⚠️ Problème de connexion avec l'IA Gemini. Vérifiez votre clé API.";
  }
}

// ==========================================
// ⚙️ SERVEUR WEB & KEEP-ALIVE
// ==========================================
const app = express();
const PORT = process.env.PORT || 3000;

process.on('uncaughtException', (err) => console.error('⚠️ Erreur évitée :', err));
process.on('unhandledRejection', (reason) => console.error('⚠️ Promesse rejetée :', reason));

app.get("/", (req, res) => res.send("⚡ TITAN BOT ULTIMATE BOOSTÉ EN LIGNE"));
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
// 🧠 FONCTIONS UTILITAIRES DE GESTION
// ==========================================
function reinitialiserJeu(groupId) {
  if (partiesEnCours[groupId]) {
    if (partiesEnCours[groupId].timerFeu) clearTimeout(partiesEnCours[groupId].timerFeu);
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
        text: "🧹 *SESSION EXPIRÉE :* Partie annulée après 2 minutes d'inactivité. Tapez le nom d'un jeu pour rejouer !" 
      });
    }
  }, 2 * 60 * 1000);
}

function calculerDelaiEnvoi(texte) {
  if (!texte || typeof texte !== 'string') return 800;
  const nbMots = texte.trim().split(/\s+/).filter(Boolean).length;
  let minSec = nbMots < 50 ? 0.8 : 1.5;
  let maxSec = nbMots < 50 ? 1.5 : 3;
  return Math.floor((minSec + Math.random() * (maxSec - minSec)) * 1000);
}

async function envoyerAvecDelai(sock, remoteJid, content, options = {}, originalMsg = null) {
  try {
    if (originalMsg) {
      await sock.readMessages([originalMsg.key]);
    }

    const texte = typeof content === 'string' ? content : (content.text || content.caption || "");
    const delaiMs = calculerDelaiEnvoi(texte);

    await sock.sendPresenceUpdate('composing', remoteJid);
    await new Promise(resolve => setTimeout(resolve, delaiMs));
    await sock.sendPresenceUpdate('paused', remoteJid);

    return await sock.sendMessage(remoteJid, content, options);
  } catch (err) {
    console.error("⚠️ Erreur lors de l'envoi du message :", err);
  }
}

function designerNouveauGuide(jeu) {
  if (!jeu.joueurs || jeu.joueurs.length === 0) return null;
  const indexAleatoire = Math.floor(Math.random() * jeu.joueurs.length);
  jeu.guideActuel = jeu.joueurs[indexAleatoire];
  return jeu.guideActuel;
}

function genererBarreHP(hp, maxHp = 100) {
  const totalBlocs = 10;
  const blocsRemplis = Math.max(0, Math.min(totalBlocs, Math.round((hp / maxHp) * totalBlocs)));
  const blocsVides = totalBlocs - blocsRemplis;
  return `[${'█'.repeat(blocsRemplis)}${'░'.repeat(blocsVides)}] ${hp}/${maxHp}`;
}

// ⏳ Moteur de gestion de la faim des animaux
setInterval(() => {
  for (const jid in animauxJoueurs) {
    const pet = animauxJoueurs[jid];
    if (pet && pet.vivant) {
      pet.faim = Math.max(0, pet.faim - 10);
      if (pet.faim === 0) {
        pet.sante = Math.max(0, pet.sante - 20);
        if (pet.sante === 0) {
          pet.vivant = false;
        }
      }
    }
  }
}, 10 * 60 * 1000);

// ==========================================
// 🚀 BOT PRINCIPAL ET ÉVÉNEMENTS
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
      console.log('⚡ BOT TITAN ULTIMATE BOOSTÉ PRÊT ET OPÉRATIONNEL !');
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    try {
      const msg = m.messages[0];
      if (!msg || !msg.message) return;

      const remoteJid = msg.key.remoteJid;
      const senderJid = msg.key.participant || remoteJid;

      // 👁️ DÉTECTION VUE UNIQUE
      const viewOnceMsg = msg.message.viewOnceMessageV2?.message || msg.message.viewOnceMessage?.message;
      if (viewOnceMsg) {
        const type = Object.keys(viewOnceMsg)[0];
        const media = viewOnceMsg[type];
        
        try {
          const stream = await downloadContentFromMessage(media, type === 'imageMessage' ? 'image' : 'video');
          let buffer = Buffer.from([]);
          for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
          }
          vueUniqueCache[remoteJid] = {
            buffer: buffer,
            type: type === 'imageMessage' ? 'image' : 'video',
            caption: media.caption || ""
          };
          vueUniqueCache[msg.key.id] = vueUniqueCache[remoteJid];
        } catch (e) {
          console.error("⚠️ Erreur sauvegarde vue unique :", e);
        }
      }

      if (msg.key.fromMe) return;

      const cleanText = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();
      const lowerText = cleanText.toLowerCase();

      await sock.readMessages([msg.key]);

      const jeu = partiesEnCours[remoteJid];
      demarrerTimerInactivite(sock, remoteJid);

      // 📜 MENU PRINCIPAL
      if (lowerText === '.menu' || lowerText === 'menu') {
        const menuText = `
⚡ *━━━ 🤖 TITAN BOT ULTIMATE 🤖 ━━━* ⚡

🐾 *──────── 🐶 ANIMAL DE COMPAGNIE ────────*
🔹 *.animal* ➔ *Adopter / Voir mon animal*
🔹 *.nourrir* ➔ *Nourrir son animal (évite sa mort !)*

👑 *──────── ⚙️ OUTILS & IA ────────*
🔹 *.v* ➔ *Révéler un message à Vue Unique*
🔹 *.pp* [@mention] ➔ *Afficher la Photo de Profil*
🔹 *.ia* [question] ➔ *Intelligence Artificielle*
🔹 *.love* ➔ *Test de Compatibilité*
🔹 *.citation* ➔ *Citation Inspirante*
🔹 *.qr* [texte/lien] ➔ *Générateur QR Code*
🔹 *.image* [recherche] ➔ *Chercher une photo*
🔹 *.yt* [lien YouTube] ➔ *Télécharger une vidéo*

🎮 *──────── 🕹️ MINI-JEUX BOOSTÉS ────────*
🎲 *.de* ➔ *Jeu de Dé (Coop & Compétitif)*
🌊 *.labyrinthe* ➔ *Solo, Duel (1v1 à 4v4) ou Équipe*
🔴 *.feurouge* ➔ *Squid Game Adaptatif*
💀 *.roulette* ➔ *Roulette Russe à Barillet*
🔢 *.chiffremystere* ➔ *Devine le Nombre (1-100)*

📋 *──────── 📌 CONTROLES ────────*
✍️ *.inscrire [Nom]* ➔ *S'inscrire à la partie*
🚀 *.lancer* ➔ *Démarrer la session*
🔄 *.restart* ➔ *Relancer le dernier jeu*
🛑 *.stop* ➔ *Arrêter et réinitialiser*
⚡ *━━━━━━━━━━━━━━━━━━━━━━━━━* ⚡`;

        await envoyerAvecDelai(sock, remoteJid, { text: menuText }, { quoted: msg }, msg);
        return;
      }

      // 🐾 ANIMAL DE COMPAGNIE
      if (lowerText === '.animal') {
        let pet = animauxJoueurs[senderJid];

        if (!pet) {
          const espece = LISTE_ANIMAUX[Math.floor(Math.random() * LISTE_ANIMAUX.length)];
          animauxJoueurs[senderJid] = {
            nom: espece.nom,
            type: espece.type,
            nourriture: espece.nourriture,
            faim: 100,
            sante: 100,
            vivant: true
          };
          pet = animauxJoueurs[senderJid];
          await envoyerAvecDelai(sock, remoteJid, { 
            text: `🎉 *ADOPTION RÉUSSIE !*\n\nVous avez adopté un **${pet.nom}** !\n🍗 Nourriture préférée : **${pet.nourriture}**\n\n⚠️ *ATTENTION :* N'oubliez pas de le nourrir avec la commande **.nourrir** sinon il risque de mourir de famine !` 
          }, { quoted: msg }, msg);
          return;
        }

        if (!pet.vivant) {
          await envoyerAvecDelai(sock, remoteJid, { 
            text: `💀 *VOTRE ANIMAL EST MORT DE FAMINE !*\n\nVotre **${pet.nom}** n'a pas été nourri à temps... 🪦\n\n👉 Tapez *.animal* à nouveau si vous souhaitez en adopter un nouveau.` 
          }, { quoted: msg }, msg);
          delete animauxJoueurs[senderJid];
          return;
        }

        await envoyerAvecDelai(sock, remoteJid, { 
          text: `🐾 *VOTRE ANIMAL DE COMPAGNIE*\n\nNom : **${pet.nom}**\n🍗 Faim : ${genererBarreHP(pet.faim)}\n❤️ Santé : ${genererBarreHP(pet.sante)}\n\n👉 Tapez *.nourrir* pour lui donner ${pet.nourriture} !` 
        }, { quoted: msg }, msg);
        return;
      }

      if (lowerText === '.nourrir') {
        const pet = animauxJoueurs[senderJid];

        if (!pet) {
          await envoyerAvecDelai(sock, remoteJid, { text: "❌ Vous n'avez pas encore d'animal ! Tapez **.animal** pour en adopter un." }, { quoted: msg }, msg);
          return;
        }

        if (!pet.vivant) {
          await envoyerAvecDelai(sock, remoteJid, { text: "💀 Trop tard... Votre animal est mort de famine. Tapez **.animal** pour réadopter." }, { quoted: msg }, msg);
          return;
        }

        if (pet.faim >= 100) {
          await envoyerAvecDelai(sock, remoteJid, { text: `😋 **${pet.nom}** est déjà totalement rassasié !` }, { quoted: msg }, msg);
          return;
        }

        pet.faim = Math.min(100, pet.faim + 40);
        pet.sante = Math.min(100, pet.sante + 20);

        await envoyerAvecDelai(sock, remoteJid, { 
          text: `🍗 Vous avez donné ${pet.nourriture} à **${pet.nom}** !\n\n🍗 Faim : ${genererBarreHP(pet.faim)}\n❤️ Santé : ${genererBarreHP(pet.sante)}` 
        }, { quoted: msg }, msg);
        return;
      }

      // 🔓 VUE UNIQUE (.v)
      if (lowerText === '.v' || lowerText === 'point v') {
        const quotedId = msg.message.extendedTextMessage?.contextInfo?.stanzaId;
        const mediaEnCache = (quotedId && vueUniqueCache[quotedId]) || vueUniqueCache[remoteJid];

        if (!mediaEnCache) {
          await envoyerAvecDelai(sock, remoteJid, { text: "❌ Aucun message à vue unique récent trouvé ou intercepté." }, { quoted: msg }, msg);
          return;
        }

        if (mediaEnCache.type === 'image') {
          await envoyerAvecDelai(sock, remoteJid, { image: mediaEnCache.buffer, caption: `🔓 *VUE UNIQUE DÉVERROUILLÉE*\n${mediaEnCache.caption}` }, { quoted: msg }, msg);
        } else if (mediaEnCache.type === 'video') {
          await envoyerAvecDelai(sock, remoteJid, { video: mediaEnCache.buffer, caption: `🔓 *VUE UNIQUE DÉVERROUILLÉE*\n${mediaEnCache.caption}` }, { quoted: msg }, msg);
        }
        return;
      }

      // 🖼️ PHOTO DE PROFIL (.pp)
      if (lowerText.startsWith('.pp')) {
        let cibleJid = senderJid;
        const mention = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        
        if (mention) {
          cibleJid = mention;
        }

        try {
          const ppUrl = await sock.profilePictureUrl(cibleJid, 'image');
          await envoyerAvecDelai(sock, remoteJid, { image: { url: ppUrl }, caption: `📸 *Photo de Profil de* @${cibleJid.split('@')[0]}`, mentions: [cibleJid] }, { quoted: msg }, msg);
        } catch (err) {
          await envoyerAvecDelai(sock, remoteJid, { text: "❌ Impossible de récupérer la photo de profil (masquée ou absente)." }, { quoted: msg }, msg);
        }
        return;
      }

      // 🤖 IA GEMINI
      if (lowerText.startsWith('.ia')) {
        const question = cleanText.replace(/^\.ia\s*/i, '').trim();
        if (!question) {
          await envoyerAvecDelai(sock, remoteJid, { text: "⚠️ Posez une question après `.ia`." }, { quoted: msg }, msg);
          return;
        }
        const reponse = await genererReponseGemini(question);
        await envoyerAvecDelai(sock, remoteJid, { text: `🤖 *TITAN IA :*\n\n${reponse}` }, { quoted: msg }, msg);
        return;
      }

      // 🖼️ RECHERCHE IMAGE
      if (lowerText.startsWith('.image')) {
        const query = cleanText.replace(/^\.image\s*/i, '').trim();
        if (!query) {
          await envoyerAvecDelai(sock, remoteJid, { text: "⚠️ Précisez le sujet de l'image." }, { quoted: msg }, msg);
          return;
        }
        try {
          const results = await google({ query: `${query} image`, disableConsole: true });
          if (!results || results.length === 0) {
            await envoyerAvecDelai(sock, remoteJid, { text: "❌ Aucune image trouvée." }, { quoted: msg }, msg);
            return;
          }
          await envoyerAvecDelai(sock, remoteJid, { text: `🖼️ *Résultat pour "${query}" :*\n🔗 ${results[0].link}` }, { quoted: msg }, msg);
        } catch (err) {
          await envoyerAvecDelai(sock, remoteJid, { text: "⚠️ Erreur lors de la recherche d'image." }, { quoted: msg }, msg);
        }
        return;
      }

      // 📥 YOUTUBE DOWNLOADER
      if (lowerText.startsWith('.yt')) {
        const parts = cleanText.split(/\s+/);
        const url = parts[1]?.trim();
        if (!url || !ytdl.validateURL(url)) {
          await envoyerAvecDelai(sock, remoteJid, { text: "⚠️ Lien invalide ! Exemple : `.yt https://youtube.com/...`" }, { quoted: msg }, msg);
          return;
        }
        try {
          await envoyerAvecDelai(sock, remoteJid, { text: "⏳ *Téléchargement du média en cours...*" }, { quoted: msg }, msg);
          const info = await ytdl.getInfo(url);
          const format = ytdl.chooseFormat(info.formats, { quality: 'lowestvideo', filter: 'videoandaudio' });
          await envoyerAvecDelai(sock, remoteJid, { video: { url: format.url }, caption: `🎥 *Titre :* ${info.videoDetails.title}` }, { quoted: msg }, msg);
        } catch (err) {
          await envoyerAvecDelai(sock, remoteJid, { text: "❌ Fichier indisponible ou trop lourd." }, { quoted: msg }, msg);
        }
        return;
      }

      // 📱 QR CODE GENERATOR
      if (lowerText.startsWith('.qr')) {
        const txt = cleanText.replace(/^\.qr\s*/i, '').trim();
        if (!txt) return;
        const qrBuffer = await QRCode.toBuffer(txt, { margin: 2, scale: 8 });
        await envoyerAvecDelai(sock, remoteJid, { image: qrBuffer, caption: `📱 *QR Code généré :* ${txt}` }, { quoted: msg }, msg);
        return;
      }

      // 💘 TEST DE COMPATIBILITÉ
      if (lowerText.startsWith('.love')) {
        const score = Math.floor(Math.random() * 101);
        let list = score > 70 ? COMMENTAIRES_LOVE.parfait : (score > 35 ? COMMENTAIRES_LOVE.moyen : COMMENTAIRES_LOVE.faible);
        await envoyerAvecDelai(sock, remoteJid, { text: `💘 *TEST DE COMPATIBILITÉ : ${score}%*\n💬 ${list[Math.floor(Math.random() * list.length)]}` }, { quoted: msg }, msg);
        return;
      }

      // 📜 CITATION
      if (lowerText === '.citation') {
        const c = CITATIONS[Math.floor(Math.random() * CITATIONS.length)];
        await envoyerAvecDelai(sock, remoteJid, { text: `📜 « ${c.c} »\n✍️ *Auteur :* ${c.a}` }, { quoted: msg }, msg);
        return;
      }

      // 🔄 RELANCE
      if (lowerText === '.restart') {
        const dernierType = partiesEnCours[remoteJid]?.dernierType || 'DE';
        reinitialiserJeu(remoteJid);
        if (dernierType === 'DE') return declencherJeuDe(sock, remoteJid, msg);
        if (dernierType === 'LABYRINTHE') return declencherJeuLabyrinthe(sock, remoteJid, msg);
        if (dernierType === 'FEU_ROUGE') return declencherJeuFeuRouge(sock, remoteJid, msg);
        if (dernierType === 'ROULETTE') return declencherJeuRoulette(sock, remoteJid, msg);
        if (dernierType === 'CHIFFRE') return declencherJeuChiffre(sock, remoteJid, msg);
      }

      // 🛑 ARRÊT
      if (lowerText === '.stop') {
        reinitialiserJeu(remoteJid);
        await envoyerAvecDelai(sock, remoteJid, { text: "🛑 *Partie arrêtée et réinitialisée.* Tapez `.menu` pour relancer !" }, { quoted: msg }, msg);
        return;
      }

      // 🚀 DECLENCHEURS
      if (lowerText === '.de') return declencherJeuDe(sock, remoteJid, msg);
      if (lowerText === '.labyrinthe') return declencherJeuLabyrinthe(sock, remoteJid, msg);
      if (lowerText === '.feurouge') return declencherJeuFeuRouge(sock, remoteJid, msg);
      if (lowerText === '.roulette') return declencherJeuRoulette(sock, remoteJid, msg);
      if (lowerText === '.chiffremystere') return declencherJeuChiffre(sock, remoteJid, msg);

      // ✍️ INSCRIPTION
      if (lowerText.startsWith('.inscrire')) {
        if (!jeu || jeu.statut !== 'INSCRIPTION') {
          await envoyerAvecDelai(sock, remoteJid, { text: "⚠️ Aucune inscription ouverte. Lancez un mini-jeu depuis le menu !" }, { quoted: msg }, msg);
          return;
        }
        const nom = cleanText.replace(/^\.inscrire\s*/i, '').trim() || `Joueur ${jeu.joueurs.length + 1}`;
        if (jeu.joueurs.some(j => j.jid === senderJid)) {
          await envoyerAvecDelai(sock, remoteJid, { text: `⚠️ Vous êtes déjà inscrit sous le nom **${nom}**.` }, { quoted: msg }, msg);
          return;
        }
        jeu.joueurs.push({ jid: senderJid, nom: nom, hp: 100, elimine: false });
        await envoyerAvecDelai(sock, remoteJid, { text: `✅ *${nom}* a rejoint la partie ! Total : **${jeu.joueurs.length} joueur(s)**` }, { quoted: msg }, msg);
        return;
      }

      // 🚀 LANCEMENT
      if (lowerText === '.lancer') {
        if (!jeu || jeu.statut !== 'INSCRIPTION') return;
        if (jeu.joueurs.length === 0) {
          await envoyerAvecDelai(sock, remoteJid, { text: "⚠️ Aucun joueur inscrit ! Inscrivez-vous avec `.inscrire Nom`." }, { quoted: msg }, msg);
          return;
        }

        if (jeu.type === 'DE') {
          jeu.statut = 'EN_COURS';
          jeu.indexTour = 0;
          jeu.objectif = Math.floor(Math.random() * 6) + 1;
          const joueurActuel = jeu.joueurs[jeu.indexTour];
          await envoyerAvecDelai(sock, remoteJid, { 
            text: `🎯 *PARTIE DE DÉ DÉMARRÉE !*\n\n📌 *OBJECTIF COLLECTIF :* Obtenir un **${jeu.objectif}** !\n\n👉 Tour de **${joueurActuel.nom}**. Tapez *@lancer* !` 
          }, { quoted: msg }, msg);
          return;
        }

        if (jeu.type === 'LABYRINTHE') {
          jeu.statut = 'EN_COURS';
          jeu.bonneDirection = ['nord', 'sud', 'est', 'ouest'][Math.floor(Math.random() * 4)];
          const guide = designerNouveauGuide(jeu);
          await envoyerAvecDelai(sock, remoteJid, { 
            text: `🧭 *EXPLORATION DU LABYRINTHE COMMENCÉE*\n\n❤️ Santé : ${genererBarreHP(jeu.hpGlobal)}\n👑 *Guide désigné :* **${guide.nom}**\n👉 Seul **${guide.nom}** peut choisir la direction : *@nord*, *@sud*, *@est*, ou *@ouest* !` 
          }, { quoted: msg }, msg);
          return;
        }

        if (jeu.type === 'FEU_ROUGE') {
          jeu.statut = 'EN_COURS';
          lancerMancheFeuRouge(sock, remoteJid);
          return;
        }

        if (jeu.type === 'ROULETTE') {
          jeu.statut = 'EN_COURS';
          jeu.indexTour = 0;
          jeu.chambresRestantes = 6;
          const premier = jeu.joueurs[0];
          await envoyerAvecDelai(sock, remoteJid, { text: `💀 *ROULETTE RUSSE BOOSTÉE*\n\n🔫 Barillet chargé : 1 balle / ${jeu.chambresRestantes} chambres.\n👉 C'est au tour de **${premier.nom}**. Tapez *@tirer* !` }, { quoted: msg }, msg);
          return;
        }

        if (jeu.type === 'CHIFFRE') {
          jeu.statut = 'EN_COURS';
          await envoyerAvecDelai(sock, remoteJid, { text: `🔢 *CHIFFRE MYSTÈRE BOOSTÉ (1-100)*\n\n🎯 Proposez un nombre directement dans le tchat !` }, { quoted: msg }, msg);
          return;
        }
      }

      // 🎯 LABYRINTHE MODES
      if (jeu && jeu.type === 'LABYRINTHE' && jeu.statut === 'CHOIX_MODE' && cleanText.startsWith('@')) {
        const modeChoice = cleanText.substring(1).trim().toLowerCase();
        if (modeChoice === 'solo') {
          jeu.joueurs.push({ jid: senderJid, nom: "Aventurier", hp: 100 });
          jeu.statut = 'EN_COURS';
          jeu.bonneDirection = ['nord', 'sud', 'est', 'ouest'][Math.floor(Math.random() * 4)];
          jeu.guideActuel = jeu.joueurs[0];
          await envoyerAvecDelai(sock, remoteJid, { text: `🎮 *MODE SOLO ACTIVÉ*\n\n❤️ Santé : ${genererBarreHP(jeu.hpGlobal)}\n👉 Choisissez votre chemin : *@nord*, *@sud*, *@est*, ou *@ouest* !` }, { quoted: msg }, msg);
          return;
        } else if (modeChoice === 'duel' || modeChoice === 'equipe') {
          jeu.statut = 'INSCRIPTION';
          await envoyerAvecDelai(sock, remoteJid, { text: `👥 *MODE ${modeChoice.toUpperCase()} ACTIVÉ*\n\n👉 Tous les participants doivent taper *.inscrire Nom*.\n👉 Tapez *.lancer* une fois l'équipe prête !` }, { quoted: msg }, msg);
          return;
        }
      }

      // 🎯 EN COURS DE JEU
      if (jeu && jeu.statut === 'EN_COURS') {

        // 🎲 DÉ
        if (jeu.type === 'DE' && lowerText === '@lancer') {
          const joueurActuel = jeu.joueurs[jeu.indexTour];
          if (senderJid !== joueurActuel.jid) {
            await envoyerAvecDelai(sock, remoteJid, { text: `⏳ Ce n'est pas votre tour ! C'est à **${joueurActuel.nom}** de lancer le dé.` }, { quoted: msg }, msg);
            return;
          }

          const tirage = Math.floor(Math.random() * 6) + 1;
          if (tirage === jeu.objectif) {
            partiesEnCours[remoteJid] = { dernierType: 'DE' };
            await envoyerAvecDelai(sock, remoteJid, { 
              text: `🎲 **${joueurActuel.nom}** a tiré un **${tirage}** !\n\n🎉 *VICTOIRE SPECTACULAIRE !* Objectif atteint avec succès ! 👏🏆\n\n🔄 Tapez *.restart* pour rejouer !` 
            }, { quoted: msg }, msg);
          } else {
            jeu.indexTour = (jeu.indexTour + 1) % jeu.joueurs.length;
            const prochainJoueur = jeu.joueurs[jeu.indexTour];
            await envoyerAvecDelai(sock, remoteJid, { 
              text: `🎲 **${joueurActuel.nom}** a obtenu un **${tirage}** (Objectif : ${jeu.objectif}).\n\n👉 Prochain lancer : **${prochainJoueur.nom}**. Tapez *@lancer* !` 
            }, { quoted: msg }, msg);
          }
          return;
        }

        // 🌊 LABYRINTHE
        if (jeu.type === 'LABYRINTHE' && cleanText.startsWith('@')) {
          const direction = cleanText.substring(1).trim().toLowerCase();
          if (['nord', 'sud', 'est', 'ouest'].includes(direction)) {

            if (jeu.joueurs.length > 1 && senderJid !== jeu.guideActuel.jid) {
              await envoyerAvecDelai(sock, remoteJid, { text: `🚫 *ACCÈS REFUSÉ :* Seul le guide actuel **${jeu.guideActuel.nom}** peut donner la direction !` }, { quoted: msg }, msg);
              return;
            }

            if (direction === jeu.bonneDirection) {
              partiesEnCours[remoteJid] = { dernierType: 'LABYRINTHE' };
              await envoyerAvecDelai(sock, remoteJid, { text: `🎉 *VICTOIRE BRILLANTE !* **${jeu.guideActuel.nom}** a trouvé la sortie vers le **${direction.toUpperCase()}** ! Vous avez triomphé du Labyrinthe ! 🏆\n\n🔄 Tapez *.restart* pour relancer le labyrinthe !` }, { quoted: msg }, msg);
            } else {
              const degats = Math.floor(Math.random() * 10) + 10;
              jeu.hpGlobal = (jeu.hpGlobal || 100) - degats;

              if (jeu.hpGlobal <= 0) {
                partiesEnCours[remoteJid] = { dernierType: 'LABYRINTHE' };
                await envoyerAvecDelai(sock, remoteJid, { text: `💀 *ÉCHEC ET PIÈGE MORTEL !* Vous avez échoué, vous n'avez plus d'HP.\n❤️ ${genererBarreHP(0)}\n\n🔄 Tapez *.restart* pour retenter l'aventure !` }, { quoted: msg }, msg);
              } else {
                jeu.bonneDirection = ['nord', 'sud', 'est', 'ouest'][Math.floor(Math.random() * 4)];
                const nouveauGuide = designerNouveauGuide(jeu);
                
                let eventMsg = `❌ Mauvaise voie (-${degats} HP) !`;
                if (Math.random() < 0.25) {
                  jeu.hpGlobal = Math.min(100, jeu.hpGlobal + 15);
                  eventMsg += `\n🧪 *POTION DE SOIN DÉCOUVERTE !* +15 HP bonus !`;
                }

                await envoyerAvecDelai(sock, remoteJid, { 
                  text: `${eventMsg}\n❤️ Santé globale : ${genererBarreHP(jeu.hpGlobal)}\n👑 *Nouveau guide :* **${nouveauGuide.nom}**\n👉 Direction suivante : *@nord*, *@sud*, *@est*, ou *@ouest*.` 
                }, { quoted: msg }, msg);
              }
            }
            return;
          }
        }

        // 💀 ROULETTE
        if (jeu.type === 'ROULETTE' && lowerText === '@tirer') {
          const joueurActuel = jeu.joueurs[jeu.indexTour];
          if (senderJid !== joueurActuel.jid) {
            await envoyerAvecDelai(sock, remoteJid, { text: `⏳ C'est à **${joueurActuel.nom}** de presser la détente !` }, { quoted: msg }, msg);
            return;
          }

          const chanceAcoups = 1 / jeu.chambresRestantes;
          if (Math.random() < chanceAcoups) {
            partiesEnCours[remoteJid] = { dernierType: 'ROULETTE' };
            await envoyerAvecDelai(sock, remoteJid, { text: `💥 *PAN !* Le coup est parti ! **${joueurActuel.nom}** est éliminé !\n\n🔄 Tapez *.restart* pour recharger et rejouer !` }, { quoted: msg }, msg);
          } else {
            jeu.chambresRestantes = Math.max(1, jeu.chambresRestantes - 1);
            jeu.indexTour = (jeu.indexTour + 1) % jeu.joueurs.length;
            const prochain = jeu.joueurs[jeu.indexTour];
            await envoyerAvecDelai(sock, remoteJid, { text: `⚙️ *CLIC !* La chambre était vide. Suée froide pour **${joueurActuel.nom}** !\n📊 *Risque au prochain tour :* 1/${jeu.chambresRestantes}\n\n👉 Au tour de **${prochain.nom}**. Tapez *@tirer* !` }, { quoted: msg }, msg);
          }
          return;
        }

        // 🔢 CHIFFRE MYSTÈRE
        if (jeu.type === 'CHIFFRE' && !isNaN(cleanText)) {
          const prop = parseInt(cleanText, 10);
          jeu.essais = (jeu.essais || 0) + 1;

          if (prop === jeu.secret) {
            partiesEnCours[remoteJid] = { dernierType: 'CHIFFRE' };
            await envoyerAvecDelai(sock, remoteJid, { text: `🎉 *EXCELLENT !* Le chiffre mystère était bien **${jeu.secret}** !\n🎯 Trouvé en **${jeu.essais} coup(s)** !\n\n🔄 Tapez *.restart* pour rejouer !` }, { quoted: msg }, msg);
          } else {
            const ecart = Math.abs(prop - jeu.secret);
            let indicEcart = ecart > 20 ? "très loin" : "tout près";
            if (prop < jeu.secret) {
              await envoyerAvecDelai(sock, remoteJid, { text: `📈 C'est **plus Grand** ! (${indicEcart})` }, { quoted: msg }, msg);
            } else {
              await envoyerAvecDelai(sock, remoteJid, { text: `📉 C'est **plus Petit** ! (${indicEcart})` }, { quoted: msg }, msg);
            }
          }
          return;
        }

        // 🔴 SQUID GAME (FEU ROUGE)
        if (jeu.type === 'FEU_ROUGE' && jeu.attenteReponse && cleanText.startsWith('@')) {
          // Extraction du mot avec passage en minuscules pour comparaison souple (ignorer la casse)
          const motPropose = cleanText.substring(1).trim().toLowerCase();
          const motAttendu = jeu.motAValider.toLowerCase();

          if (motPropose === motAttendu) {
            const j = jeu.joueurs.find(j => j.jid === senderJid);
            if (j && !j.aRepondu && !j.elimine) {
              j.aRepondu = true;
              await envoyerAvecDelai(sock, remoteJid, { text: `⚡ **${j.nom}** a réagi à temps !` }, { quoted: msg }, msg);
            }
          }
          return;
        }

      }

    } catch (err) {
      console.error(err);
    }
  });
}

// ==========================================
// 🛠️ DÉCLENCHEURS DE MINI-JEUX
// ==========================================
function declencherJeuDe(sock, remoteJid, msg) {
  reinitialiserJeu(remoteJid);
  partiesEnCours[remoteJid] = { type: 'DE', statut: 'INSCRIPTION', joueurs: [] };
  return envoyerAvecDelai(sock, remoteJid, { 
    text: `🎲 *JEU DU DÉ (BATTLE ROYALE / COOP)*\n\n👉 Tapez *.inscrire Nom* pour participer.\n👉 Tapez *.lancer* quand tout le monde est prêt !` 
  }, { quoted: msg }, msg);
}

function declencherJeuLabyrinthe(sock, remoteJid, msg) {
  reinitialiserJeu(remoteJid);
  partiesEnCours[remoteJid] = { type: 'LABYRINTHE', statut: 'CHOIX_MODE', joueurs: [], hpGlobal: 100 };
  return envoyerAvecDelai(sock, remoteJid, { 
    text: `🌊 *GRAND LABYRINTHE DE SURVIE BOOSTÉ*\n\nChoisissez votre mode de jeu :\n👉 Tapez *@solo* (Défi individuel)\n👉 Tapez *@duel* (Mode affrontement)\n👉 Tapez *@equipe* (Escouade complète contre le bot)` 
  }, { quoted: msg }, msg);
}

function declencherJeuFeuRouge(sock, remoteJid, msg) {
  reinitialiserJeu(remoteJid);
  partiesEnCours[remoteJid] = { type: 'FEU_ROUGE', statut: 'INSCRIPTION', joueurs: [] };
  return envoyerAvecDelai(sock, remoteJid, { 
    text: `🔴 *SQUID GAME : FEU ROUGE / FEU VERT*\n\n👉 Tapez *.inscrire Nom* pour entrer dans l'arène.\n👉 Tapez *.lancer* pour démarrer la manche !` 
  }, { quoted: msg }, msg);
}

function declencherJeuRoulette(sock, remoteJid, msg) {
  reinitialiserJeu(remoteJid);
  partiesEnCours[remoteJid] = { type: 'ROULETTE', statut: 'INSCRIPTION', joueurs: [] };
  return envoyerAvecDelai(sock, remoteJid, { 
    text: `💀 *ROULETTE RUSSE EXTRÊME*\n\n👉 Tapez *.inscrire Nom* pour charger une balle.\n👉 Tapez *.lancer* pour démarrer !` 
  }, { quoted: msg }, msg);
}

function declencherJeuChiffre(sock, remoteJid, msg) {
  reinitialiserJeu(remoteJid);
  partiesEnCours[remoteJid] = { type: 'CHIFFRE', statut: 'INSCRIPTION', joueurs: [], secret: Math.floor(Math.random() * 100) + 1, essais: 0 };
  return envoyerAvecDelai(sock, remoteJid, { 
    text: `🔢 *CHIFFRE MYSTÈRE BOOSTÉ (1 À 100)*\n\n👉 Tapez *.lancer* pour générer le chiffre secret !` 
  }, { quoted: msg }, msg);
}

// ==========================================
// 🔴 MOTEUR SQUID GAME (DÉLAI ADAPTATIF 5s à 8s)
// ==========================================
async function lancerMancheFeuRouge(sock, remoteJid) {
  const jeu = partiesEnCours[remoteJid];
  if (!jeu || jeu.type !== 'FEU_ROUGE') return;

  const mot = MOTS_SQUID[Math.floor(Math.random() * MOTS_SQUID.length)];
  jeu.motAValider = mot;
  jeu.attenteReponse = true;
  jeu.joueurs.forEach(j => j.aRepondu = false);

  // ⏱️ Calcul adaptatif du temps (entre 5s et 8s selon la longueur du mot)
  let tempsSec = 5 + Math.floor(Math.random() * 3); 
  if (mot.length >= 8) {
    tempsSec = 6 + Math.floor(Math.random() * 3); // 6s à 8s pour les mots longs
  }

  await envoyerAvecDelai(sock, remoteJid, { 
    text: `🔴 *FEU ROUGE !*\n\n👉 Tapez exactement *@${mot}* dans le tchat !\n⏰ Vous avez **${tempsSec} secondes** avant le FEU VERT !` 
  });

  jeu.timerFeu = setTimeout(async () => {
    jeu.attenteReponse = false;

    jeu.joueurs.forEach(j => {
      if (!j.aRepondu) j.elimine = true;
    });

    const survivants = jeu.joueurs.filter(j => !j.elimine);
    await envoyerAvecDelai(sock, remoteJid, { text: `🟢 *FEU VERT !* Temps écoulé !` });

    if (survivants.length === 0) {
      partiesEnCours[remoteJid] = { dernierType: 'FEU_ROUGE' };
      await envoyerAvecDelai(sock, remoteJid, { text: `💥 *ÉLIMINATION TOTALE !* Personne n'a été assez rapide !\n\n🔄 Tapez *.restart* pour rejouer !` });
    } else if (survivants.length === 1) {
      partiesEnCours[remoteJid] = { dernierType: 'FEU_ROUGE' };
      await envoyerAvecDelai(sock, remoteJid, { text: `🏆 *VICTOIRE SUPRÊME !* **${survivants[0].nom}** est le seul survivant du Squid Game !\n\n🔄 Tapez *.restart* pour relancer une partie !` });
    } else {
      await envoyerAvecDelai(sock, remoteJid, { text: `📊 *Survivants restants :* ${survivants.length}\n⚡ Prochaine vague dans 4 secondes...` });
      setTimeout(() => lancerMancheFeuRouge(sock, remoteJid), 4000);
    }
  }, tempsSec * 1000);
}

startBot();
