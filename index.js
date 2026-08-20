// ⚡ FIX CRYPTO POUR RENDER & BAILEYS
const crypto = require('crypto');
if (!globalThis.crypto) globalThis.crypto = crypto;

const fs = require('fs');

// 🧹 NETTOYAGE FORCÉ DE L'ANCIENNE SESSION AU DÉMARRAGE
if (fs.existsSync('./auth_info')) {
  try {
    fs.rmSync('./auth_info', { recursive: true, force: true });
    console.log("🗑️ Ancienne session auth_info supprimée avec succès !");
  } catch (err) {
    console.error("⚠️ Erreur lors de la suppression de la session :", err);
  }
}

const express = require("express");
const https = require("https");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadContentFromMessage,
  Browsers
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const { Readable } = require('stream');

// ⚙️ CONFIGURATION FFMPEG STATIC POUR RENDER
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
  console.log("✅ FFmpeg Static configuré avec succès !");
} else {
  console.error("❌ Erreur : Impossible de trouver le binaire FFmpeg.");
}

// ==========================================
// 🔑 CONFIGURATION CLÉ API GEMINI
// ==========================================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
let genAI = null;
if (GEMINI_API_KEY && GEMINI_API_KEY !== "AQ.Ab8RN6I7BdoBx9K8z_BFaGBAbqCj_UEA2xI7nXZrDs1Z9AQw_w") {
  genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
}

// 🔗 IMPORTATION DES BANQUES DE DONNÉES ET ÉTATS (data.js)
const {
  COMMENTAIRES_LOVE,
  MOTS_AMOUR_PRIVE,
  REPONSE_AMOUR_MAMAN,
  LISTE_ANIMAUX,
  MOTS_SQUID,
  DONNEES_DETECTIVE_BOOSTE,
  DONNEES_CERVEAU,
  COMMENTAIRES_CERVEAU,
  MESSAGE_SECRET_ANDY,
  CHEMINS_LABYRINTHE,
  SUBS_LABYRINTHE,
  partiesEnCours,
  timersInactivite,
  vueUniqueCache,
  animauxJoueurs,
  mesNotes,
  sessionsMotDePasse,
  profilsJoueurs,
  membresSalues,
  sessionsSecretAndy
} = require('./data');

// ==========================================
// ⚙️ SERVEUR WEB & KEEP-ALIVE
// ==========================================
const app = express();
const PORT = process.env.PORT || 3000;

process.on('uncaughtException', (err) => console.error('⚠️ Erreur évitée :', err));
process.on('unhandledRejection', (reason) => console.error('⚠️ Promesse rejetée :', reason));

app.get("/", (req, res) => res.send("⚡ TITAN BOT ULTIMATE BOOSTÉ EN LIGNE"));
app.get("/health", (req, res) => res.status(200).send("OK"));

// Route de secours pour réinitialiser la session uniquement quand VOUS le décidez
app.get("/reset-session", (req, res) => {
  try {
    if (fs.existsSync('./auth_info')) {
      fs.rmSync('./auth_info', { recursive: true, force: true });
    }
    res.send("🗑️ Session supprimée avec succès. Redémarrez le service pour générer un nouveau code.");
  } catch (err) {
    res.status(500).send("⚠️ Erreur lors de la suppression : " + err.message);
  }
});

app.listen(PORT, () => console.log(`🌐 Serveur actif sur le port ${PORT}`));

// Ping automatique pour éviter la mise en veille (Keep-Alive)
setInterval(() => {
  const renderUrl = process.env.RENDER_EXTERNAL_URL;
  if (renderUrl) {
    https.get(renderUrl, (res) => console.log(`⏰ Keep-Alive Status: ${res.statusCode}`))
        .on('error', (err) => console.error('⚠️ Erreur Keep-Alive :', err.message));
  }
}, 8 * 60 * 1000);

// ==========================================
// 🎙️ CONVERTISSEUR AUDIO OPUS (COMPATIBILITÉ WHATSAPP PTT)
// ==========================================
function convertirMp3EnOpus(bufferMp3) {
  return new Promise((resolve, reject) => {
    const inputStream = Readable.from(bufferMp3);
    const chunks = [];

    ffmpeg(inputStream)
      .toFormat('ogg')
      .audioCodec('libopus')
      .on('error', (err) => reject(err))
      .pipe()
      .on('data', (chunk) => chunks.push(chunk))
      .on('end', () => resolve(Buffer.concat(chunks)));
  });
}

// ==========================================
// 🧠 FONCTIONS UTILITAIRES DE GESTION
// ==========================================
function reinitialiserJeu(groupId) {
  if (partiesEnCours[groupId]) {
    if (partiesEnCours[groupId].timerFeu) clearTimeout(partiesEnCours[groupId].timerFeu);
    if (partiesEnCours[groupId].timerDetective) clearTimeout(partiesEnCours[groupId].timerDetective);
    if (partiesEnCours[groupId].timerBombe) clearTimeout(partiesEnCours[groupId].timerBombe);
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

function genererBarreHP(hp, maxHp = 100) {
  const totalBlocs = 10;
  const blocsRemplis = Math.max(0, Math.min(totalBlocs, Math.round((hp / maxHp) * totalBlocs)));
  const blocsVides = totalBlocs - blocsRemplis;
  return `[${'█'.repeat(blocsRemplis)}${'░'.repeat(blocsVides)}] ${hp}/${maxHp}`;
}

setInterval(() => {
  for (const jid in animauxJoueurs) {
    const pet = animauxJoueurs[jid];
    if (pet && pet.vivant) {
      pet.faim = Math.max(0, pet.faim - 10);
      pet.energie = Math.max(0, pet.energie - 5);
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
let pairingCodeDemande = false;

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'),
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 10000
  });

  if (!sock.authState.creds.registered && !pairingCodeDemande) {
    pairingCodeDemande = true;
    const rawNumber = process.env.PHONE_NUMBER || "2250141606159";
    const phoneNumber = rawNumber.replace(/[^0-9]/g, "");

    setTimeout(async () => {
      try {
        let code = await sock.requestPairingCode(phoneNumber);
        code = code?.match(/.{1,4}/g)?.join("-") || code;
        console.log(`\n==================================`);
        console.log(`👉 CODE DE JUMELAGE : ${code}`);
        console.log(`==================================\n`);
      } catch (err) {
        console.error("❌ Erreur lors de la demande du Pairing Code :", err);
        pairingCodeDemande = false;
      }
    }, 10000);
  }

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      console.log(`⚠️ Connexion fermée. Code raison : ${statusCode}`);
      
      if (statusCode !== DisconnectReason.loggedOut) {
        setTimeout(() => startBot(), 3000);
      } else {
        console.log("❌ La session WhatsApp a été déconnectée du téléphone.");
      }
    } else if (connection === 'open') {
      console.log('⚡ BOT TITAN ULTIMATE BOOSTÉ PRÊT ET OPÉRATIONNEL !');
      pairingCodeDemande = false;
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    try {
      const msg = m.messages[0];
      if (!msg || !msg.message) return;
      
      if (msg.key.fromMe) return;

      const remoteJid = msg.key.remoteJid;
      const senderJid = msg.key.participant || remoteJid;
      const estGroupe = remoteJid.endsWith('@g.us');

      // 👁️ DÉTECTION & RENVOI AUTOMATIQUE VUE UNIQUE
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
          
          if (type === 'imageMessage') {
            await envoyerAvecDelai(sock, remoteJid, { image: buffer, caption: `🔓 *VUE UNIQUE AUTOMATIQUE*\n${media.caption || ""}` }, { quoted: msg }, msg);
          } else if (type === 'videoMessage') {
            await envoyerAvecDelai(sock, remoteJid, { video: buffer, caption: `🔓 *VUE UNIQUE AUTOMATIQUE*\n${media.caption || ""}` }, { quoted: msg }, msg);
          }

          vueUniqueCache[remoteJid] = {
            buffer: buffer,
            type: type === 'imageMessage' ? 'image' : 'video',
            caption: media.caption || ""
          };
          vueUniqueCache[msg.key.id] = vueUniqueCache[remoteJid];
        } catch (e) {
          console.error("⚠️ Erreur traitement vue unique auto :", e);
        }
      }

      const cleanText = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();
      const lowerText = cleanText.toLowerCase();

      // 💬 RÉPONSE AUTOMATIQUE EN CHAT PRIVÉ
      if (!estGroupe && MOTS_AMOUR_PRIVE.includes(lowerText)) {
        await envoyerAvecDelai(sock, remoteJid, { text: REPONSE_AMOUR_MAMAN }, { quoted: msg }, msg);
        return;
      }

      // 👋 SALUTATION AUTOMATIQUE
      if (estGroupe && profilsJoueurs[senderJid] && !membresSalues.has(`${remoteJid}_${senderJid}`)) {
        membresSalues.add(`${remoteJid}_${senderJid}`);
        const nomJoueur = profilsJoueurs[senderJid];
        await envoyerAvecDelai(sock, remoteJid, { text: `👋 Bienvenue **${nomJoueur}** ! Ravi de te voir par ici ! ⚡` }, { quoted: msg }, msg);
      }

      // 🔑 GESTION DU MOT DE PASSE (.notes)
      if (sessionsMotDePasse[senderJid]) {
        delete sessionsMotDePasse[senderJid];

        if (cleanText === '@Ashley' || cleanText === 'ashley' || cleanText.toLowerCase() === 'ashley') {
          const userNotes = mesNotes[senderJid] || [];
          let listeText = "🔓 *ACCÈS AUTORISÉ - VOS NOTES :*\n\n";
          userNotes.forEach((n, idx) => { listeText += `*${idx + 1}.* ${n}\n`; });
          listeText += "\n👉 Tapez **.clearnotes** pour tout effacer.";
          await envoyerAvecDelai(sock, remoteJid, { text: listeText }, { quoted: msg }, msg);
        } else {
          await envoyerAvecDelai(sock, remoteJid, { text: "❌ *MOT DE PASSE INCORRECT !*\n\n🔒 Session fermée." }, { quoted: msg }, msg);
        }
        return;
      }

      // 🤫 SECRET D'ANDY
      if (lowerText === 'secret') {
        sessionsSecretAndy[senderJid] = { étape: 'ATTENTE_CONFIRMATION' };
        await envoyerAvecDelai(sock, remoteJid, { text: "Veux-tu vraiment connaître le secret d'Andy ?" }, { quoted: msg }, msg);
        return;
      }

      if (sessionsSecretAndy[senderJid]) {
        const session = sessionsSecretAndy[senderJid];

        if (session.étape === 'ATTENTE_CONFIRMATION') {
          if (lowerText === 'oui') {
            session.étape = 'ATTENTE_IDENTITE';
            await envoyerAvecDelai(sock, remoteJid, { text: "Alors dis-moi qui es-tu pour vouloir connaître le secret d'Andy ? Entre ton nom :" }, { quoted: msg }, msg);
          } else {
            delete sessionsSecretAndy[senderJid];
            await envoyerAvecDelai(sock, remoteJid, { text: "D'accord, une autre fois peut-être !" }, { quoted: msg }, msg);
          }
          return;
        }

        if (session.étape === 'ATTENTE_IDENTITE') {
          delete sessionsSecretAndy[senderJid];
          if (lowerText === '@ashley' || lowerText === 'ashley') {
            await envoyerAvecDelai(sock, remoteJid, { text: MESSAGE_SECRET_ANDY }, { quoted: msg }, msg);
          } else {
            await envoyerAvecDelai(sock, remoteJid, { text: "❌ Tentative échouée, tu n'es pas reconnu ! Accès refusé, tu es exterminé ! 🚪💥" }, { quoted: msg }, msg);
          }
          return;
        }
      }

      const jeu = partiesEnCours[remoteJid];
      demarrerTimerInactivite(sock, remoteJid);

      // 💣 JEU DE LA BOMBE
      if (jeu && jeu.type === 'BOMBE' && jeu.statut === 'EN_COURS') {
        if (senderJid === jeu.joueurJid && (lowerText === '@rouge' || lowerText === '@bleu' || lowerText === '@jaune')) {
          clearTimeout(jeu.timerBombe);
          const filChoisi = lowerText.replace('@', '');
          const nomJoueur = profilsJoueurs[senderJid] || "Joueur";

          if (filChoisi === jeu.bonFil) {
            partiesEnCours[remoteJid] = { dernierType: 'BOMBE' };
            await envoyerAvecDelai(sock, remoteJid, { text: `🟢 *BOMBE DÉSAMORCÉE !* 🟢\n\n✂️ **${nomJoueur}** a coupé le fil **${filChoisi.toUpperCase()}** !\n\n🎉 Félicitations, la bombe a été désactivée avec succès !\n🔄 Tapez *.restart* pour rejouer !` }, { quoted: msg }, msg);
          } else {
            partiesEnCours[remoteJid] = { dernierType: 'BOMBE' };
            await envoyerAvecDelai(sock, remoteJid, { text: `💥 *BOOOOOOOM !* 💥\n\n❌ **${nomJoueur}** a coupé le fil **${filChoisi.toUpperCase()}**...\n⚡ Le bon fil était le fil **${jeu.bonFil.toUpperCase()}** !\n\n💀 La bombe a explosé !\n🔄 Tapez *.restart* pour rejouer !` }, { quoted: msg }, msg);
          }
          return;
        }
      }

      // 🎮 LABYRINTHE
      if (jeu && jeu.type === 'LABYRINTHE' && jeu.statut === 'EN_COURS') {
        const directionMap = { '@gauche': 'gauche', '@droite': 'droite', '@tout droit': 'tout droit' };

        if (directionMap[lowerText]) {
          const dirChoisie = directionMap[lowerText];
          const cheminActuel = CHEMINS_LABYRINTHE[jeu.indexChemin];
          const bonneDirection = cheminActuel[jeu.étape];

          const repRandom = SUBS_LABYRINTHE[Math.floor(Math.random() * SUBS_LABYRINTHE.length)];
          await envoyerAvecDelai(sock, remoteJid, { text: repRandom }, { quoted: msg }, msg);

          if (dirChoisie === bonneDirection) {
            jeu.historique.push({ étape: jeu.étape, dir: dirChoisie, bon: true });
            jeu.étape += 1;

            if (jeu.étape === 9) {
              await envoyerAvecDelai(sock, remoteJid, { text: `✨ *Bonne voie !* C'est le dernier passage pour être libéré ! 🥳\n❤️ Santé : ${genererBarreHP(jeu.vie)}` }, { quoted: msg }, msg);
            } else if (jeu.étape >= 10) {
              partiesEnCours[remoteJid] = { dernierType: 'LABYRINTHE' };
              await envoyerAvecDelai(sock, remoteJid, { text: `🏆 *FÉLICITATIONS !* Vous avez traversé le labyrinthe sain et sauf ! 🎉🥳\n\n🔄 Tapez *.restart* pour rejouer !` }, { quoted: msg }, msg);
              return;
            } else {
              await envoyerAvecDelai(sock, remoteJid, { text: `✨ *Bonne direction !* Vous avancez sereinement (Étape ${jeu.étape}/10).\n❤️ Santé : ${genererBarreHP(jeu.vie)}` }, { quoted: msg }, msg);
            }
          } else {
            jeu.vie = Math.max(0, jeu.vie - 10);
            jeu.historique.push({ étape: jeu.étape, dir: dirChoisie, bon: false });

            if (jeu.vie <= 0) {
              partiesEnCours[remoteJid] = { dernierType: 'LABYRINTHE' };
              await envoyerAvecDelai(sock, remoteJid, { text: `💔 Votre santé est tombée à 0%... Vous êtes mort dans le labyrinthe. 💀\n\n💥 *FIN DE LA PARTIE (FIN)*\n🔄 Tapez *.restart* pour rejouer !` }, { quoted: msg }, msg);
              return;
            } else {
              await envoyerAvecDelai(sock, remoteJid, { text: `❌ *Mauvaise direction !* Vous avez perdu 10% de vie. 💔\n❤️ Santé : ${genererBarreHP(jeu.vie)}\n\n👉 Utilise l'émoji ⏪ pour revenir en arrière si besoin.` }, { quoted: msg }, msg);
            }
          }
          return;
        }

        if (cleanText === '⏪') {
          if (jeu.historique.length > 0 && !jeu.retourUtilisePourEtape[jeu.étape]) {
            const dernierMouv = jeu.historique.pop();
            if (dernierMouv.bon) {
              jeu.étape = Math.max(0, jeu.étape - 1);
            }
            jeu.retourUtilisePourEtape[jeu.étape] = true;
            await envoyerAvecDelai(sock, remoteJid, { text: `⏪ *RETOUR EN ARRIÈRE !* Vous revenez au carrefour précédent (Étape ${jeu.étape}/10).\n❤️ Santé : ${genererBarreHP(jeu.vie)}` }, { quoted: msg }, msg);
          } else {
            await envoyerAvecDelai(sock, remoteJid, { text: `⚠️ Vous ne pouvez plus utiliser le retour en arrière à cet endroit !` }, { quoted: msg }, msg);
          }
          return;
        }
      }

      // 🧠 CERVEAU / MOX BOOSTÉ
      if (lowerText.startsWith('.cerveau') || lowerText.includes('cerveau') || lowerText.includes('mox')) {
        let cibleJid = senderJid;
        const mention = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (mention) cibleJid = mention;

        const nomCible = profilsJoueurs[cibleJid] || `@${cibleJid.split('@')[0]}`;
        let analyse = `🧠 *ANALYSE MENTALE COMPLÈTE DE ${nomCible.toUpperCase()}* 🧠\n\n`;
        
        DONNEES_CERVEAU.forEach((stat) => {
          const pourcentage = Math.floor(Math.random() * 101);
          const barre = genererBarreHP(pourcentage, 100);
          analyse += `${stat} :\n${barre} (${pourcentage}%)\n\n`;
        });

        const commAleatoire = COMMENTAIRES_CERVEAU[Math.floor(Math.random() * COMMENTAIRES_CERVEAU.length)];
        analyse += `📝 *Commentaire du Bot :* ${commAleatoire}`;

        await envoyerAvecDelai(sock, remoteJid, { text: analyse, mentions: [cibleJid] }, { quoted: msg }, msg);
        return;
      }

      // 🎙️ CONVERSION TEXTE EN VOCAL OPTIMISÉE WHATSAPP
      if (lowerText.startsWith('.voc')) {
        const texteParle = cleanText.replace(/^\.voc\s*/i, '').trim();

        if (!texteParle) {
          await envoyerAvecDelai(sock, remoteJid, { 
            text: "⚠️ Précise le texte à prononcer !\n\nExemple : `.voc Salut tout le monde`" 
          }, { quoted: msg }, msg);
          return;
        }

        try {
          const ttsUrl = `https://api.streamelements.com/kappa/v2/speech?voice=Mathieu&text=${encodeURIComponent(texteParle)}`;
          const res = await fetch(ttsUrl);
          
          if (!res.ok) throw new Error("Échec du téléchargement de l'audio");

          const arrayBuf = await res.arrayBuffer();
          const bufferMp3 = Buffer.from(arrayBuf);
          
          const bufferOpus = await convertirMp3EnOpus(bufferMp3);

          await envoyerAvecDelai(sock, remoteJid, { 
            audio: bufferOpus, 
            mimetype: 'audio/ogg; codecs=opus', 
            ptt: true 
          }, { quoted: msg }, msg);
        } catch (err) {
          console.error("⚠️ Erreur lors de la génération vocale :", err);
          await envoyerAvecDelai(sock, remoteJid, { 
            text: `❌ Erreur de conversion vocale. Assurez-vous que FFmpeg est bien configuré sur le serveur (${err.message})` 
          }, { quoted: msg }, msg);
        }
        return;
      }

      // 🤖 GEMINI AI
      if (lowerText.startsWith('.gemini') || lowerText.startsWith('.ai')) {
        const prompt = cleanText.replace(/^(\.gemini|\.ai)\s*/i, '').trim();

        if (!prompt) {
          await envoyerAvecDelai(sock, remoteJid, { text: "⚠️ Pose une question à Gemini AI !\n\nExemple : `.gemini Écris une histoire courte`" }, { quoted: msg }, msg);
          return;
        }

        if (!genAI) {
          await envoyerAvecDelai(sock, remoteJid, { text: "⚠️ *CLÉ API GEMINI MANQUANTE OU INVALIDE !*\n\nAllez sur Google AI Studio (aistudio.google.com), récupérez une clé API gratuite et ajoutez-la dans les variables Render sous le nom `GEMINI_API_KEY`." }, { quoted: msg }, msg);
          return;
        }

        try {
          const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
          const result = await model.generateContent(prompt);
          const responseText = result.response.text();

          await envoyerAvecDelai(sock, remoteJid, { text: `🤖 *GEMINI AI :*\n\n${responseText}` }, { quoted: msg }, msg);
        } catch (err) {
          console.error("⚠️ Erreur Gemini API :", err);
          await envoyerAvecDelai(sock, remoteJid, { text: `❌ Erreur de communication avec Gemini API (${err.message || 'Clé invalide'}).` }, { quoted: msg }, msg);
        }
        return;
      }

      // 📜 MENU
      if (lowerText === '.menu' || lowerText === 'menu') {
        const nomAffiche = profilsJoueurs[senderJid] ? profilsJoueurs[senderJid] : "Joueur";
        const menuText = `
⚡ *━━━ 🤖 JE SUIS BOTTI LE BOT 🤖 ━━━* ⚡
👤 *Bienvenue comment vas-tu aujourd'hui? ${nomAffiche} !*

👤 *──────── 📇 PROFIL & IDENTITÉ ────────*
🔹 *.inscrire [Nom]* ➔ *S'enregistrer auprès du Bot*
🔹 *.pseudonyme [Nouveau Nom]* ➔ *Modifier son nom / surnom*

📝 *──────── 📌 NOTES & RAPPELS ────────*
🔹 *.note [texte]* ➔ *Ajouter une note*
🔹 *.notes* ➔ *Afficher mes notes (Protégé par MDP)*
🔹 *.clearnotes* ➔ *Effacer toutes mes notes*

🐾 *──────── 🐶 ANIMAL DE COMPAGNIE ────────*
🔹 *.toutou* ➔ *Adopter / Voir les capacités & état de son animal*
🔹 *.nourrir* ➔ *Nourrir son animal*
🔹 *.dodo* ➔ *Faire dormir son animal*
🔹 *.parc* ➔ *L'emmener se balader au parc*
🔹 *.soigner* ➔ *Soigner son animal*

⚙️ *──────── 🛠️ OUTILS & MEDIA ────────*
👁️ *.v* ➔ *Révéler Photo/Vidéo Vue Unique*
👤 *.pp* [@mention] ➔ *Afficher la Photo de Profil*
🎙️ *.voc* [texte] ➔ *Convertir un texte en vraie note vocale*
🤖 *.gemini* [texte] ➔ *Poser une question à l'IA Gemini*
❤️ *.love* [solo/@mention] ➔ *Test Win Love (Solo ou Duo)*
🔹 *.qr* [texte/lien] ➔ *Générateur QR Code*
🧠 *.cerveau* [@mention] ➔ *Analyse Mentale / Mox Boostée*

🎮 *──────── 🕹️ MINI-JEUX MULTI-MODES ────────*
💣 *.bombe* ➔ *Désamorce la Bombe avant Explosion*
🎲 *.de* ➔ *Jeu de Dé Ultra*
🚪 *.lab* ➔ *Le Labyrinthe des Portes Mortelles*
🔴 *.feurouge* ➔ *Squid Game Extreme*
💀 *.roulette* ➔ *Roulette Russe Tactical (Groupe/Solo)*
🔢 *.chiffremystere* ➔ *Devine le Nombre*
🕵️‍♂️ *.detective* ➔ *Enquête Criminelle*

⚙️ *──────── ⚔️ MODES DE JEU ────────*
🔹 *.mode solo* ➔ *Mode Joueur Solitaire*
🔹 *.mode groupe* ➔ *Mode Multi-Joueurs / Groupe*
🔹 *.mode 1v1* ➔ *Mode Duel*
🔹 *.mode 2v2* ➔ *Mode Équipe 2 Contre 2*
🔹 *.mode 4v4* ➔ *Mode Équipe 4 Contre 4*
🔹 *.joindre [A/B]* ➔ *Rejoindre l'Équipe A ou B*

📋 *──────── 📌 CONTRÔLES DU JEU ────────*
🚀 *.lancer* ➔ *Démarrer la session*
🔄 *.restart* ➔ *Relancer le dernier jeu*
🛑 *.stop* ➔ *Arrêter et réinitialiser*
⚡ *━━━━━━━━━━━━━━━━━━━━━━━━━* ⚡`;

        await envoyerAvecDelai(sock, remoteJid, { text: menuText }, { quoted: msg }, msg);
        return;
      }

      // 👤 INSCRIPTION & PARAMÈTRES
      if (lowerText.startsWith('.inscrire')) {
        const nomEntre = cleanText.replace(/^\.inscrire\s*/i, '').trim();
        if (!nomEntre) {
          await envoyerAvecDelai(sock, remoteJid, { text: "⚠️ Choisissez bien votre nom !\n\nExemple : `.inscrire Andy`" }, { quoted: msg }, msg);
          return;
        }

        profilsJoueurs[senderJid] = nomEntre;

        if (jeu && jeu.statut === 'INSCRIPTION') {
          if (!jeu.joueurs.some(j => j.jid === senderJid)) {
            jeu.joueurs.push({ jid: senderJid, nom: nomEntre, elimine: false, bouclier: true, score: 0 });
          }
        }

        await envoyerAvecDelai(sock, remoteJid, { text: `🎉 *PROFIL ENREGISTRÉ !*\n\nBienvenue **${nomEntre}** !` }, { quoted: msg }, msg);
        return;
      }

      if (lowerText.startsWith('.pseudonyme') || lowerText.startsWith('.pseudo')) {
        const nouveauNom = cleanText.replace(/^(\.pseudonyme|\.pseudo)\s*/i, '').trim();
        if (!nouveauNom) {
          await envoyerAvecDelai(sock, remoteJid, { text: "⚠️ Précisez votre nouveau nom. Exemple : `.pseudonyme Alex The King`" }, { quoted: msg }, msg);
          return;
        }

        const ancienNom = profilsJoueurs[senderJid] || "Joueur";
        profilsJoueurs[senderJid] = nouveauNom;

        if (jeu && jeu.joueurs) {
          const j = jeu.joueurs.find(j => j.jid === senderJid);
          if (j) j.nom = nouveauNom;
        }

        await envoyerAvecDelai(sock, remoteJid, { text: `🔄 *PROFIL MIS À JOUR !*\n\nAncien nom : **${ancienNom}**\nNouveau nom : **${nouveauNom}**` }, { quoted: msg }, msg);
        return;
      }

      // 🔓 DÉVERROUILLAGE VUE UNIQUE
      if (lowerText === '.v' || lowerText === 'point v') {
        const quotedId = msg.message.extendedTextMessage?.contextInfo?.stanzaId;
        const mediaEnCache = (quotedId && vueUniqueCache[quotedId]) || vueUniqueCache[remoteJid];

        if (!mediaEnCache) {
          await envoyerAvecDelai(sock, remoteJid, { text: "❌ Aucun message à vue unique récent trouvé." }, { quoted: msg }, msg);
          return;
        }

        if (mediaEnCache.type === 'image') {
          await envoyerAvecDelai(sock, remoteJid, { image: mediaEnCache.buffer, caption: `🔓 *VUE UNIQUE DÉVERROUILLÉE*\n${mediaEnCache.caption}` }, { quoted: msg }, msg);
        } else if (mediaEnCache.type === 'video') {
          await envoyerAvecDelai(sock, remoteJid, { video: mediaEnCache.buffer, caption: `🔓 *VUE UNIQUE DÉVERROUILLÉE*\n${mediaEnCache.caption}` }, { quoted: msg }, msg);
        }
        return;
      }

      // ⚙️ MODE DE JEU
      if (lowerText.startsWith('.mode')) {
        if (!jeu || jeu.statut !== 'INSCRIPTION') {
          await envoyerAvecDelai(sock, remoteJid, { text: "⚠️ Lancez d'abord un jeu avant de choisir le mode !" }, { quoted: msg }, msg);
          return;
        }
        const option = cleanText.replace(/^\.mode\s*/i, '').trim().toLowerCase();

        if (option === 'solo') {
          jeu.mode = 'SOLO';
          jeu.tailleEquipe = 1;
          await envoyerAvecDelai(sock, remoteJid, { text: "🎮 Mode défini sur : **SOLO**." }, { quoted: msg }, msg);
        } else if (option === 'groupe' || option === 'group') {
          jeu.mode = 'GROUPE';
          await envoyerAvecDelai(sock, remoteJid, { text: "👥 Mode défini sur : **GROUPE**. Inscriptions ouvertes pour tous !" }, { quoted: msg }, msg);
        } else if (option === '1v1') {
          jeu.mode = '1V1';
          jeu.tailleEquipe = 1;
          await envoyerAvecDelai(sock, remoteJid, { text: "⚔️ Mode défini sur : **DUEL 1V1**." }, { quoted: msg }, msg);
        } else if (option === '2v2') {
          jeu.mode = 'EQUIPE';
          jeu.tailleEquipe = 2;
          await envoyerAvecDelai(sock, remoteJid, { text: "👥 Mode défini sur : **ÉQUIPE 2V2**. Rejoignez avec `.joindre A` ou `.joindre B`." }, { quoted: msg }, msg);
        } else if (option === '4v4') {
          jeu.mode = 'EQUIPE';
          jeu.tailleEquipe = 4;
          await envoyerAvecDelai(sock, remoteJid, { text: "🛡️ Mode défini sur : **ÉQUIPE 4V4**. Rejoignez avec `.joindre A` ou `.joindre B`." }, { quoted: msg }, msg);
        } else {
          await envoyerAvecDelai(sock, remoteJid, { text: "⚠️ Modes valides : `.mode solo`, `.mode groupe`, `.mode 1v1`, `.mode 2v2`, `.mode 4v4`" }, { quoted: msg }, msg);
        }
        return;
      }

      // 👥 REJOINDRE ÉQUIPE
      if (lowerText.startsWith('.joindre')) {
        if (!jeu || jeu.mode !== 'EQUIPE') {
          await envoyerAvecDelai(sock, remoteJid, { text: "⚠️ Le jeu actuel n'est pas en mode Équipe !" }, { quoted: msg }, msg);
          return;
        }
        const eqChoice = cleanText.replace(/^\.joindre\s*/i, '').trim().toUpperCase();
        if (eqChoice !== 'A' && eqChoice !== 'B') {
          await envoyerAvecDelai(sock, remoteJid, { text: "⚠️ Précisez une équipe valide : `.joindre A` ou `.joindre B`" }, { quoted: msg }, msg);
          return;
        }

        if (jeu.equipes[eqChoice].length >= jeu.tailleEquipe) {
          await envoyerAvecDelai(sock, remoteJid, { text: `❌ L'Équipe ${eqChoice} est déjà complète !` }, { quoted: msg }, msg);
          return;
        }

        const nomJoueur = profilsJoueurs[senderJid] || "Joueur";
        jeu.equipes.A = jeu.equipes.A.filter(j => j.jid !== senderJid);
        jeu.equipes.B = jeu.equipes.B.filter(j => j.jid !== senderJid);

        jeu.equipes[eqChoice].push({ jid: senderJid, nom: nomJoueur });
        await envoyerAvecDelai(sock, remoteJid, { text: `✅ **${nomJoueur}** a rejoint l'**Équipe ${eqChoice}** ! (${jeu.equipes[eqChoice].length}/${jeu.tailleEquipe})` }, { quoted: msg }, msg);
        return;
      }

      // 📝 GESTION NOTES
      if (lowerText.startsWith('.note ')) {
        const texteNote = cleanText.replace(/^\.note\s*/i, '').trim();
        if (!texteNote) {
          await envoyerAvecDelai(sock, remoteJid, { text: "⚠️ Précise le texte à enregistrer. Exemple : `.note Acheter du pain`" }, { quoted: msg }, msg);
          return;
        }

        if (!mesNotes[senderJid]) mesNotes[senderJid] = [];
        mesNotes[senderJid].push(texteNote);

        await envoyerAvecDelai(sock, remoteJid, { text: `✅ *NOTE ENREGISTRÉE !*\n\n📌 "*${texteNote}*"\n\n👉 Tapez **.notes** pour y accéder.` }, { quoted: msg }, msg);
        return;
      }

      if (lowerText === '.notes') {
        const userNotes = mesNotes[senderJid] || [];
        if (userNotes.length === 0) {
          await envoyerAvecDelai(sock, remoteJid, { text: "📭 Vous n'avez aucune note enregistrée." }, { quoted: msg }, msg);
          return;
        }

        sessionsMotDePasse[senderJid] = true;
        await envoyerAvecDelai(sock, remoteJid, { text: "🔒 Veuillez entrer le mot de passe secret pour afficher vos notes :" }, { quoted: msg }, msg);
        return;
      }

      if (lowerText === '.clearnotes') {
        mesNotes[senderJid] = [];
        await envoyerAvecDelai(sock, remoteJid, { text: "🗑️ Toutes vos notes ont été effacées avec succès !" }, { quoted: msg }, msg);
        return;
      }

      // 🐾 ANIMAL DE COMPAGNIE
      if (lowerText === '.toutou' || lowerText === '.animal') {
        let pet = animauxJoueurs[senderJid];

        if (!pet) {
          const espece = LISTE_ANIMAUX[Math.floor(Math.random() * LISTE_ANIMAUX.length)];
          animauxJoueurs[senderJid] = {
            nom: espece.nom,
            type: espece.type,
            nourriture: espece.nourriture,
            faim: 100,
            sante: 100,
            energie: 100,
            bonheur: 100,
            vivant: true
          };
          pet = animauxJoueurs[senderJid];
          await envoyerAvecDelai(sock, remoteJid, { text: `🎉 *ADOPTION RÉUSSIE !*\n\nVous avez adopted un **${pet.nom}** !\n🍗 Nourriture préférée : **${pet.nourriture}**\n\nCommandes disponibles : \`.nourrir\`, \`.dodo\`, \`.parc\`, \`.soigner\`` }, { quoted: msg }, msg);
          return;
        }

        if (!pet.vivant) {
          await envoyerAvecDelai(sock, remoteJid, { text: `💀 *VOTRE ANIMAL EST MORT DE NÉGLIGENCES !*\n\n👉 Tapez **.toutou** à nouveau pour en adopter un autre.` }, { quoted: msg }, msg);
          delete animauxJoueurs[senderJid];
          return;
        }

        const toutouText = `🐾 *CAPACITÉS & ÉTAT DE VOTRE ANIMAL* 🐾\n\n` +
          `🏷️ *Nom :* **${pet.nom}**\n` +
          `🍗 *Faim :* ${genererBarreHP(pet.faim)}\n` +
          `❤️ *Santé :* ${genererBarreHP(pet.sante)}\n` +
          `⚡ *Énergie :* ${genererBarreHP(pet.energie)}\n` +
          `💖 *Bonheur :* ${genererBarreHP(pet.bonheur)}\n\n` +
          `✨ *Commandes d'interaction :*\n` +
          `🔹 **.nourrir** ➔ Donner à manger (${pet.nourriture})\n` +
          `🔹 **.dodo** ➔ Faire faire une sieste 😴\n` +
          `🔹 **.parc** ➔ L'emmener se balader 🌳\n` +
          `🔹 **.soigner** ➔ Soigner ses blessures 🩺`;

        await envoyerAvecDelai(sock, remoteJid, { text: toutouText }, { quoted: msg }, msg);
        return;
      }

      if (lowerText === '.nourrir') {
        const pet = animauxJoueurs[senderJid];
        if (!pet || !pet.vivant) {
          await envoyerAvecDelai(sock, remoteJid, { text: "❌ Vous n'avez pas d'animal ! Tapez **.toutou** pour en adopter un." }, { quoted: msg }, msg);
          return;
        }

        pet.faim = Math.min(100, pet.faim + 40);
        pet.sante = Math.min(100, pet.sante + 10);
        await envoyerAvecDelai(sock, remoteJid, { text: `🍗 Vous avez donné ${pet.nourriture} à **${pet.nom}** !\n\n🍗 Faim : ${genererBarreHP(pet.faim)}` }, { quoted: msg }, msg);
        return;
      }

      if (lowerText === '.dodo') {
        const pet = animauxJoueurs[senderJid];
        if (!pet || !pet.vivant) {
          await envoyerAvecDelai(sock, remoteJid, { text: "❌ Vous n'avez pas d'animal !" }, { quoted: msg }, msg);
          return;
        }

        pet.energie = 100;
        pet.sante = Math.min(100, pet.sante + 15);
        await envoyerAvecDelai(sock, remoteJid, { text: `😴 **${pet.nom}** fait une bonne sieste... Énergie restaurée à 100% ! ⚡` }, { quoted: msg }, msg);
        return;
      }

      if (lowerText === '.parc') {
        const pet = animauxJoueurs[senderJid];
        if (!pet || !pet.vivant) {
          await envoyerAvecDelai(sock, remoteJid, { text: "❌ Vous n'avez pas d'animal !" }, { quoted: msg }, msg);
          return;
        }

        if (pet.energie < 20) {
          await envoyerAvecDelai(sock, remoteJid, { text: `⚠️ **${pet.nom}** est trop fatigué pour aller au parc ! Faites-lui faire **.dodo**.` }, { quoted: msg }, msg);
          return;
        }

        pet.bonheur = Math.min(100, pet.bonheur + 30);
        pet.energie = Math.max(0, pet.energie - 25);
        pet.faim = Math.max(0, pet.faim - 20);

        await envoyerAvecDelai(sock, remoteJid, { text: `🌳 Super balade au parc ! **${pet.nom}** s'est bien amusé !\n💖 Bonheur : ${genererBarreHP(pet.bonheur)}` }, { quoted: msg }, msg);
        return;
      }

      if (lowerText === '.soigner') {
        const pet = animauxJoueurs[senderJid];
        if (!pet || !pet.vivant) {
          await envoyerAvecDelai(sock, remoteJid, { text: "❌ Vous n'avez pas d'animal !" }, { quoted: msg }, msg);
          return;
        }

        pet.sante = 100;
        await envoyerAvecDelai(sock, remoteJid, { text: `🩺 Vous avez soigné **${pet.nom}** ! Sa santé est au maximum ! ❤️` }, { quoted: msg }, msg);
        return;
      }

      // 🖼️ PHOTO DE PROFIL
      if (lowerText.startsWith('.pp')) {
        let cibleJid = senderJid;
        const mention = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (mention) cibleJid = mention;

        try {
          const ppUrl = await sock.profilePictureUrl(cibleJid, 'image');
          await envoyerAvecDelai(sock, remoteJid, { image: { url: ppUrl }, caption: `📸 Photo de Profil` }, { quoted: msg }, msg);
        } catch (err) {
          await envoyerAvecDelai(sock, remoteJid, { text: "❌ Impossible de récupérer la photo de profil." }, { quoted: msg }, msg);
        }
        return;
      }

      // 📱 QR CODE
      if (lowerText.startsWith('.qr')) {
        const txt = cleanText.replace(/^\.qr\s*/i, '').trim();
        if (!txt) return;
        const qrBuffer = await QRCode.toBuffer(txt, { margin: 2, scale: 8 });
        await envoyerAvecDelai(sock, remoteJid, { image: qrBuffer, caption: `📱 *QR Code généré :* ${txt}` }, { quoted: msg }, msg);
        return;
      }

      // 💘 WIN LOVE (MODE SOLO & DUO/ÉMOTION)
      if (lowerText.startsWith('.love')) {
        const args = cleanText.split(' ');
        const mode = args[1]?.toLowerCase();
        const mention = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

        if (mode === 'solo' || (!mention && mode !== 'duo')) {
          const tauxAmour = Math.floor(Math.random() * 101);
          const chanceTomberAmoureux = Math.floor(Math.random() * 101);
          const chanceEtreAime = Math.floor(Math.random() * 101);
          const seduction = Math.floor(Math.random() * 101);

          const nomJoueur = profilsJoueurs[senderJid] || "Toi";
          const resSolo = `💖 *ANALYSE WIN LOVE SOLO : ${nomJoueur.toUpperCase()}* 💖\n\n` +
            `❤️ *Taux d'amour pur :* ${genererBarreHP(tauxAmour)} (${tauxAmour}%)\n` +
            `🍀 *Chance de tomber amoureux :* ${genererBarreHP(chanceTomberAmoureux)} (${chanceTomberAmoureux}%)\n` +
            `✨ *Chance d'être aimé en retour :* ${genererBarreHP(chanceEtreAime)} (${chanceEtreAime}%)\n` +
            `🔥 *Niveau de séduction :* ${genererBarreHP(seduction)} (${seduction}%)\n\n` +
            `🤖 *Diagnostic du Bot :* ${tauxAmour > 50 ? "Ton cœur est prêt pour le grand amour ! 🥰" : "Mode célibataire endurci activé ! 😎"}`;

          await envoyerAvecDelai(sock, remoteJid, { text: resSolo }, { quoted: msg }, msg);
          return;
        } else {
          const cibleJid = mention || senderJid;
          const nomCible = profilsJoueurs[cibleJid] || `@${cibleJid.split('@')[0]}`;
          const score = Math.floor(Math.random() * 101);
          let list = score > 70 ? COMMENTAIRES_LOVE.parfait : (score > 35 ? COMMENTAIRES_LOVE.moyen : COMMENTAIRES_LOVE.faible);
          
          const resDuo = `💘 *TEST LOVE & ÉMOTION avec ${nomCible}* 💘\n\n` +
            `📊 *Compatibilité :* ${score}%\n` +
            `💬 *Réaction du Bot :* ${list[Math.floor(Math.random() * list.length)]}`;

          await envoyerAvecDelai(sock, remoteJid, { text: resDuo, mentions: [cibleJid] }, { quoted: msg }, msg);
          return;
        }
      }

      // 🔄 RELANCE & STOP
      if (lowerText === '.restart') {
        const dernierType = partiesEnCours[remoteJid]?.dernierType || 'DE';
        reinitialiserJeu(remoteJid);
        if (dernierType === 'BOMBE') return declencherJeuBombe(sock, remoteJid, senderJid, msg);
        if (dernierType === 'DE') return declencherJeuDe(sock, remoteJid, msg);
        if (dernierType === 'LABYRINTHE') return declencherJeuLabyrinthe(sock, remoteJid, msg);
        if (dernierType === 'FEU_ROUGE') return declencherJeuFeuRouge(sock, remoteJid, msg);
        if (dernierType === 'ROULETTE') return declencherJeuRoulette(sock, remoteJid, msg);
        if (dernierType === 'CHIFFRE') return declencherJeuChiffre(sock, remoteJid, msg);
        if (dernierType === 'DETECTIVE') return declencherJeuDetective(sock, remoteJid, msg);
      }

      if (lowerText === '.stop') {
        reinitialiserJeu(remoteJid);
        await envoyerAvecDelai(sock, remoteJid, { text: "🛑 *Partie arrêtée.* Tapez `.menu` pour recommencer !" }, { quoted: msg }, msg);
        return;
      }

      // 🚀 COMMANDES DE JEU
      if (lowerText === '.bombe') return declencherJeuBombe(sock, remoteJid, senderJid, msg);
      if (lowerText === '.de') return declencherJeuDe(sock, remoteJid, msg);
      if (lowerText === '.lab' || lowerText === '.labyrinthe') return declencherJeuLabyrinthe(sock, remoteJid, msg);
      if (lowerText === '.feurouge') return declencherJeuFeuRouge(sock, remoteJid, msg);
      if (lowerText === '.roulette') return declencherJeuRoulette(sock, remoteJid, msg);
      if (lowerText === '.chiffremystere') return declencherJeuChiffre(sock, remoteJid, msg);
      if (lowerText === '.detective') return declencherJeuDetective(sock, remoteJid, msg);

      // 🚀 LANCEMENT
      if (lowerText === '.lancer') {
        if (!jeu || jeu.statut !== 'INSCRIPTION') return;

        if (profilsJoueurs[senderJid] && !jeu.joueurs.some(j => j.jid === senderJid)) {
          jeu.joueurs.push({ jid: senderJid, nom: profilsJoueurs[senderJid], elimine: false, bouclier: true, score: 0 });
        }

        if (jeu.type === 'DE') {
          jeu.statut = 'EN_COURS';
          jeu.indexTour = 0;
          jeu.objectif = Math.floor(Math.random() * 6) + 1;
          jeu.mult = Math.floor(Math.random() * 3) + 1;
          const joueurActuel = jeu.joueurs[jeu.indexTour] || { nom: "Joueur" };
          await envoyerAvecDelai(sock, remoteJid, { text: `🎯 *JEU DU DÉ ULTRA STARTED !*\n\n📌 *OBJECTIF :* Tirer un **${jeu.objectif}** !\n\n👉 C'est le tour de **${joueurActuel.nom}**. Tapez *@lancer* !` }, { quoted: msg }, msg);
          return;
        }

        if (jeu.type === 'FEU_ROUGE') {
          jeu.statut = 'EN_COURS';
          lancerMancheFeuRouge(sock, remoteJid);
          return;
        }

        if (jeu.type === 'ROULETTE') {
          if (jeu.mode === 'GROUPE' && jeu.joueurs.length < 2) {
            await envoyerAvecDelai(sock, remoteJid, { text: "⚠️ Au moins 2 joueurs doivent s'inscrire pour le mode Groupe !" }, { quoted: msg }, msg);
            return;
          }
          jeu.statut = 'EN_COURS';
          jeu.indexTour = 0;
          jeu.chambresRestantes = 6;
          const premier = jeu.joueurs[0] || { nom: profilsJoueurs[senderJid] || "Joueur" };
          await envoyerAvecDelai(sock, remoteJid, { text: `💀 *ROULETTE RUSSE STARTED !*\n\n🔫 1 Balle / 6 chambres.\n👥 Mode : **${jeu.mode}**\n\n👉 Au tour de **${premier.nom}**. Tapez *@tirer* !` }, { quoted: msg }, msg);
          return;
        }

        if (jeu.type === 'CHIFFRE') {
          jeu.statut = 'EN_COURS';
          await envoyerAvecDelai(sock, remoteJid, { text: `🔢 *CHIFFRE MYSTÈRE (1-100)*\n\n🎯 Mode : ${jeu.mode}\nDevinez le nombre dans le tchat !` }, { quoted: msg }, msg);
          return;
        }
      }

      // 🎯 DÉROULEMENT DES JEUX
      if (jeu && jeu.statut === 'EN_COURS') {

        if (jeu.type === 'DE' && lowerText === '@lancer') {
          const joueurActuel = jeu.joueurs[jeu.indexTour] || { jid: senderJid, nom: "Joueur" };
          if (jeu.mode !== 'SOLO' && senderJid !== joueurActuel.jid) {
            await envoyerAvecDelai(sock, remoteJid, { text: `⏳ Tour de **${joueurActuel.nom}**.` }, { quoted: msg }, msg);
            return;
          }

          const tirage = Math.floor(Math.random() * 6) + 1;
          if (tirage === jeu.objectif) {
            partiesEnCours[remoteJid] = { dernierType: 'DE' };
            await envoyerAvecDelai(sock, remoteJid, { text: `🎲 **${joueurActuel.nom}** a obtenu **${tirage}** !\n\n🎉 *VICTOIRE !* Objectif atteint !\n\n🔄 Tapez *.restart* pour rejouer !` }, { quoted: msg }, msg);
          } else {
            if (jeu.joueurs.length > 0) {
              jeu.indexTour = (jeu.indexTour + 1) % jeu.joueurs.length;
            }
            const prochainJoueur = jeu.joueurs[jeu.indexTour] || joueurActuel;
            await envoyerAvecDelai(sock, remoteJid, { text: `🎲 **${joueurActuel.nom}** a tiré un **${tirage}** (Objectif : ${jeu.objectif}).\n\n👉 Au tour de **${prochainJoueur.nom}**. Tapez *@lancer* !` }, { quoted: msg }, msg);
          }
          return;
        }

        if (jeu.type === 'ROULETTE' && lowerText === '@tirer') {
          if (jeu.mode === 'SOLO') {
            const tireur = profilsJoueurs[senderJid] || "Joueur";
            if (Math.random() < (1 / jeu.chambresRestantes)) {
              partiesEnCours[remoteJid] = { dernierType: 'ROULETTE' };
              await envoyerAvecDelai(sock, remoteJid, { text: `💥 *PAN !* Le coup est parti... **${tireur}** a perdu ! 💀\n\n🔄 Tapez *.restart* pour rejouer !` }, { quoted: msg }, msg);
            } else {
              jeu.chambresRestantes = Math.max(1, jeu.chambresRestantes - 1);
              await envoyerAvecDelai(sock, remoteJid, { text: `⚙️ *CLIC !* Chambre vide pour **${tireur}** ! (${jeu.chambresRestantes} restantes)\n\n👉 Tapez à nouveau *@tirer* pour continuer !` }, { quoted: msg }, msg);
            }
            return;
          }

          const survivants = jeu.joueurs.filter(j => !j.elimine);
          if (survivants.length === 0) return;

          const joueurActuel = survivants[jeu.indexTour % survivants.length];
          if (senderJid !== joueurActuel.jid) {
            await envoyerAvecDelai(sock, remoteJid, { text: `⏳ C'est le tour de **${joueurActuel.nom}** !` }, { quoted: msg }, msg);
            return;
          }

          if (Math.random() < (1 / jeu.chambresRestantes)) {
            joueurActuel.elimine = true;
            const restants = jeu.joueurs.filter(j => !j.elimine);
            
            if (restants.length <= 1) {
              const gagnant = restants[0] ? restants[0].nom : "Personne";
              partiesEnCours[remoteJid] = { dernierType: 'ROULETTE' };
              await envoyerAvecDelai(sock, remoteJid, { text: `💥 *PAN !* **${joueurActuel.nom}** est éliminé !\n\n🏆 *VICTOIRE DU GROUPE !* **${gagnant}** est le dernier survivant ! 🎉\n🔄 Tapez *.restart* pour rejouer !` }, { quoted: msg }, msg);
            } else {
              jeu.chambresRestantes = 6;
              jeu.indexTour = jeu.indexTour % restants.length;
              const prochain = restants[jeu.indexTour];
              await envoyerAvecDelai(sock, remoteJid, { text: `💥 *PAN !* Élimination de **${joueurActuel.nom}** !\n\n🔄 Barillet rechargé (6 chambres).\n👉 Au tour de **${prochain.nom}**. Tapez *@tirer* !` }, { quoted: msg }, msg);
            }
          } else {
            jeu.chambresRestantes = Math.max(1, jeu.chambresRestantes - 1);
            jeu.indexTour = (jeu.indexTour + 1) % survivants.length;
            const prochain = survivants[jeu.indexTour];
            await envoyerAvecDelai(sock, remoteJid, { text: `⚙️ *CLIC !* Chambre vide pour **${joueurActuel.nom}**.\n\n👉 Tour de **${prochain.nom}**. Tapez *@tirer* !` }, { quoted: msg }, msg);
          }
          return;
        }

        if (jeu.type === 'CHIFFRE' && !isNaN(cleanText)) {
          const prop = parseInt(cleanText, 10);
          jeu.essais = (jeu.essais || 0) + 1;

          if (prop === jeu.secret) {
            partiesEnCours[remoteJid] = { dernierType: 'CHIFFRE' };
            const nomGagnant = profilsJoueurs[senderJid] || "Joueur";
            
            let messageVictoire = `🎉 *VICTOIRE DE ${nomGagnant.toUpperCase()} !*\n\n🎯 Le chiffre mystère était bien **${jeu.secret}** !\n⏱️ Trouvé en **${jeu.essais} tentative(s)** !`;

            if (jeu.mode === 'EQUIPE') {
              const eqA = jeu.equipes.A.some(j => j.jid === senderJid);
              const equipeGagnante = eqA ? "ÉQUIPE A" : "ÉQUIPE B";
              messageVictoire = `🏆 *VICTOIRE DE L'${equipeGagnante} !* 🎉\n\n🎯 **${nomGagnant}** a trouvé le chiffre mystère (**${jeu.secret}**) !`;
            }

            await envoyerAvecDelai(sock, remoteJid, { text: `${messageVictoire}\n\n🔄 Tapez *.restart* pour rejouer !` }, { quoted: msg }, msg);
          } else {
            const direction = prop < jeu.secret ? "📈 *C'est PLUS GRAND !*" : "📉 *C'est PLUS PETIT !*";
            await envoyerAvecDelai(sock, remoteJid, { text: `${direction}\n\n📊 Essai n°${jeu.essais}` }, { quoted: msg }, msg);
          }
          return;
        }

        if (jeu.type === 'DETECTIVE_BOOSTE') {
          if (lowerText === '.fouille') {
            if (jeu.elimines.has(senderJid)) {
              await envoyerAvecDelai(sock, remoteJid, { text: "🚫 Vous êtes éliminé de cette affaire !" }, { quoted: msg }, msg);
              return;
            }

            const chance = Math.random();
            if (chance > 0.5) {
              const lieuxFaux = DONNEES_DETECTIVE_BOOSTE.lieux.filter(l => l !== jeu.lieu);
              const fauxLieu = lieuxFaux[Math.floor(Math.random() * lieuxFaux.length)];
              await envoyerAvecDelai(sock, remoteJid, { text: `🔎 *Fouille réussie !* Vous trouvez un indice qui élimine **${fauxLieu}** !` }, { quoted: msg }, msg);
            } else {
              const fauxMessage = DONNEES_DETECTIVE_BOOSTE.temoignagesFaux[Math.floor(Math.random() * DONNEES_DETECTIVE_BOOSTE.temoignagesFaux.length)];
              await envoyerAvecDelai(sock, remoteJid, { text: `📜 *Indice récolté :* ${fauxMessage}` }, { quoted: msg }, msg);
            }
            return;
          }

          if (lowerText.startsWith('.accuser')) {
            if (jeu.elimines.has(senderJid)) {
              await envoyerAvecDelai(sock, remoteJid, { text: "🚫 Vous ne pouvez plus tenter d'accusation !" }, { quoted: msg }, msg);
              return;
            }

            const nomJoueur = profilsJoueurs[senderJid] || "Inspecteur";
            const proposition = cleanText.replace(/^\.accuser\s*/i, '').toLowerCase();

            const coupableTrouve = proposition.includes(jeu.coupable.toLowerCase());
            const lieuTrouve = proposition.includes(jeu.lieu.toLowerCase());
            const armeTrouvee = proposition.includes(jeu.arme.toLowerCase());

            if (coupableTrouve && lieuTrouve && armeTrouvee) {
              partiesEnCours[remoteJid] = { dernierType: 'DETECTIVE' };
              await envoyerAvecDelai(sock, remoteJid, { text: `🏆 *ENQUÊTE RÉSOLUE !* 🏆\n\nL'inspecteur **${nomJoueur}** a trouvé le vrai criminel !\n\n👤 Criminel : **${jeu.coupable}**\n📍 Lieu : **${jeu.lieu}**\n🗡️ Arme : **${jeu.arme}**\n\n🔄 Tapez *.restart* pour rejouer !` }, { quoted: msg }, msg);
            } else {
              jeu.elimines.add(senderJid);
              await envoyerAvecDelai(sock, remoteJid, { text: `💥 *ARRESTATION RATÉE !* L'accusation de **${nomJoueur}** était fausse. Vous êtes retiré de l'enquête !` }, { quoted: msg }, msg);
            }
            return;
          }
        }

        if (jeu.type === 'FEU_ROUGE' && jeu.attenteReponse && cleanText.startsWith('@')) {
          const reponseSaisie = cleanText.substring(1).trim().toLowerCase();
          const motAttendu = jeu.motAValider.toLowerCase();

          if (reponseSaisie === motAttendu) {
            const j = jeu.joueurs.find(j => j.jid === senderJid);
            if (j && !j.aRepondu && !j.elimine) {
              j.aRepondu = true;
              await envoyerAvecDelai(sock, remoteJid, { text: `⚡ **${j.nom}** est en sécurité !` }, { quoted: msg }, msg);
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
function declencherJeuBombe(sock, remoteJid, senderJid, msg) {
  reinitialiserJeu(remoteJid);

  const fils = ['rouge', 'bleu', 'jaune'];
  const bonFil = fils[Math.floor(Math.random() * fils.length)];
  const nomJoueur = profilsJoueurs[senderJid] || "Joueur";

  const timerBombe = setTimeout(async () => {
    if (partiesEnCours[remoteJid] && partiesEnCours[remoteJid].type === 'BOMBE') {
      partiesEnCours[remoteJid] = { dernierType: 'BOMBE' };
      await envoyerAvecDelai(sock, remoteJid, { text: `💥 *BOOOOOOOM !* Temps écoulé pour **${nomJoueur}** !\n\n⚡ La bombe a explosé parce que vous avez hésité trop longtemps !\n🔄 Tapez *.restart* pour rejouer !` });
    }
  }, 15000);

  partiesEnCours[remoteJid] = {
    type: 'BOMBE',
    statut: 'EN_COURS',
    joueurJid: senderJid,
    bonFil: bonFil,
    timerBombe: timerBombe
  };

  const textBombe = `💣 *ATTENTION ! BOMBE À DÉSAMORCER !* 💣\n\n` +
    `👤 **${nomJoueur}**, tu as activé une bombe explosive !\n` +
    `Elle contient 3 fils : 🔴 Rouge | 🔵 Bleu | 🟡 Jaune\n\n` +
    `✂️ Pour couper un fil, tape immédiatement :\n` +
    `👉 \`@rouge\`, \`@bleu\` ou \`@jaune\`\n\n` +
    `⏳ *Vous avez 15 secondes avant l'explosion !*`;

  return envoyerAvecDelai(sock, remoteJid, { text: textBombe }, { quoted: msg }, msg);
}

function declencherJeuDe(sock, remoteJid, msg) {
  reinitialiserJeu(remoteJid);
  partiesEnCours[remoteJid] = { type: 'DE', statut: 'INSCRIPTION', mode: 'SOLO', joueurs: [], equipes: { A: [], B: [] } };
  return envoyerAvecDelai(sock, remoteJid, { text: `🎲 *JEU DU DÉ ULTRA*\n\n👉 Choisissez le mode : \`.mode solo\`, \`.mode 1v1\`, \`.mode 2v2\` ou \`.mode 4v4\`\n👉 Tapez *.lancer* pour démarrer !` }, { quoted: msg }, msg);
}

function declencherJeuLabyrinthe(sock, remoteJid, msg) {
  reinitialiserJeu(remoteJid);
  const indexChemin = Math.floor(Math.random() * CHEMINS_LABYRINTHE.length);

  partiesEnCours[remoteJid] = {
    type: 'LABYRINTHE',
    statut: 'EN_COURS',
    indexChemin: indexChemin,
    étape: 0,
    vie: 100,
    historique: [],
    retourUtilisePourEtape: {}
  };

  const introText = `🚪 *AVENTURE DANS LE LABYRINTHE MORTEL* 🚪\n\n` +
    `Vous avez été élu par le bot pour pouvoir participer à cette aventure à la fois palpitante et risquée. ` +
    `Vous devez choisir la bonne direction (⬇️⬆️➡️⬅️) pour pouvoir sortir sain et sauf du labyrinthe avant que votre vie ❤️ ne se détériore 💔.\n\n` +
    `Si vous choisissez la bonne direction, vous serez intact 😌 mais si votre santé ❤️ se détériore jusqu'à arriver à 0%, vous mourrez et c'est la fin de la partie (fin).\n\n` +
    `📌 *Aidez-vous avec :* \`@gauche\`, \`@droite\`, \`@tout droit\`\n` +
    `❤️ Santé initiale : ${genererBarreHP(100)}`;

  return envoyerAvecDelai(sock, remoteJid, { text: introText }, { quoted: msg }, msg);
}

function declencherJeuFeuRouge(sock, remoteJid, msg) {
  reinitialiserJeu(remoteJid);
  partiesEnCours[remoteJid] = { type: 'FEU_ROUGE', statut: 'INSCRIPTION', mode: 'SOLO', joueurs: [], equipes: { A: [], B: [] } };
  return envoyerAvecDelai(sock, remoteJid, { text: `🔴 *SQUID GAME EXTREME*\n\n👉 Tapez *.inscrire [Nom]* pour participer.\n👉 Tapez *.lancer* pour lancer la manche !` }, { quoted: msg }, msg);
}

function declencherJeuRoulette(sock, remoteJid, msg) {
  reinitialiserJeu(remoteJid);
  partiesEnCours[remoteJid] = { 
    type: 'ROULETTE', 
    statut: 'INSCRIPTION', 
    mode: 'SOLO', 
    joueurs: [], 
    equipes: { A: [], B: [] },
    chambresRestantes: 6,
    indexTour: 0
  };
  return envoyerAvecDelai(sock, remoteJid, { text: `💀 *ROULETTE RUSSE TACTIQUE*\n\n👉 Choisissez le mode : \`.mode solo\` ou \`.mode groupe\`\n👉 En mode groupe, inscrivez-vous avec \`.inscrire [Nom]\` puis tapez *.lancer* !` }, { quoted: msg }, msg);
}

function declencherJeuChiffre(sock, remoteJid, msg) {
  reinitialiserJeu(remoteJid);
  partiesEnCours[remoteJid] = { 
    type: 'CHIFFRE', 
    statut: 'INSCRIPTION', 
    mode: 'SOLO', 
    joueurs: [], 
    equipes: { A: [], B: [] }, 
    secret: Math.floor(Math.random() * 100) + 1, 
    essais: 0 
  };
  return envoyerAvecDelai(sock, remoteJid, { text: `🔢 *CHIFFRE MYSTÈRE (1 À 100)*\n\n👉 Choisissez le mode (\`.mode solo\`, \`.mode 2v2\`, etc.) puis tapez *.lancer* !` }, { quoted: msg }, msg);
}

function declencherJeuDetective(sock, remoteJid, msg) {
  reinitialiserJeu(remoteJid);

  const coupable = DONNEES_DETECTIVE_BOOSTE.suspects[Math.floor(Math.random() * DONNEES_DETECTIVE_BOOSTE.suspects.length)];
  const lieu = DONNEES_DETECTIVE_BOOSTE.lieux[Math.floor(Math.random() * DONNEES_DETECTIVE_BOOSTE.lieux.length)];
  const arme = DONNEES_DETECTIVE_BOOSTE.armes[Math.floor(Math.random() * DONNEES_DETECTIVE_BOOSTE.armes.length)];

  partiesEnCours[remoteJid] = {
    type: 'DETECTIVE_BOOSTE',
    statut: 'EN_COURS',
    coupable: coupable,
    lieu: lieu,
    arme: arme,
    elimines: new Set()
  };

  const introText = `
🚨 *AFFAIRE CRIMINELLE ULTRA : CRIME AU MANOIR* 🚨

Un crime a été commis ! Récoltez des preuves rapidement.

🕵️ *SUSPECTS :* ${DONNEES_DETECTIVE_BOOSTE.suspects.join(' | ')}
📍 *LIEUX :* ${DONNEES_DETECTIVE_BOOSTE.lieux.join(' | ')}
🗡️ *ARMES :* ${DONNEES_DETECTIVE_BOOSTE.armes.join(' | ')}

⚡ *COMMANDES D'ENQUÊTE :*
🔹 **.fouille** ➔ Obtenir un indice.
🔹 **.accuser [Suspect] [Lieu] [Arme]** ➔ Tenter une arrestation !
`;

  return envoyerAvecDelai(sock, remoteJid, { text: introText }, { quoted: msg }, msg);
}

// ==========================================
// 🔴 MOTEUR SQUID GAME
// ==========================================
async function lancerMancheFeuRouge(sock, remoteJid) {
  const jeu = partiesEnCours[remoteJid];
  if (!jeu || jeu.type !== 'FEU_ROUGE') return;

  const mot = MOTS_SQUID[Math.floor(Math.random() * MOTS_SQUID.length)];
  jeu.motAValider = mot;
  jeu.attenteReponse = true;
  jeu.joueurs.forEach(j => j.aRepondu = false);

  let tempsSec = 9 + Math.floor(Math.random() * 2); 

  await envoyerAvecDelai(sock, remoteJid, { text: `🔴 *FEU ROUGE !*\n\n👉 Tapez en vitesse *@${mot}* dans le tchat !\n⏰ Chrono : **${tempsSec} secondes** !` });

  jeu.timerFeu = setTimeout(async () => {
    jeu.attenteReponse = false;

    jeu.joueurs.forEach(j => {
      if (!j.aRepondu) j.elimine = true;
    });

    const survivants = jeu.joueurs.filter(j => !j.elimine);
    await envoyerAvecDelai(sock, remoteJid, { text: `🟢 *FEU VERT !* Temps écoulé !` });

    if (survivants.length === 0) {
      partiesEnCours[remoteJid] = { dernierType: 'FEU_ROUGE' };
      await envoyerAvecDelai(sock, remoteJid, { text: `💥 *ÉLIMINATION TOTALE !*\n\n🔄 Tapez *.restart* pour rejouer !` });
    } else if (survivants.length === 1) {
      partiesEnCours[remoteJid] = { dernierType: 'FEU_ROUGE' };
      await envoyerAvecDelai(sock, remoteJid, { text: `🏆 *CHAMPION SQUID GAME !* **${survivants[0].nom}** remporte la partie !\n\n🔄 Tapez *.restart* pour rejouer !` });
    } else {
      await envoyerAvecDelai(sock, remoteJid, { text: `📊 *Survivants :* ${survivants.length}\n⚡ Prochaine manche imminente...` });
      setTimeout(() => lancerMancheFeuRouge(sock, remoteJid), 3500);
    }
  }, tempsSec * 1000);
}

startBot();
