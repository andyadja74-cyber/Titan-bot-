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
const { GoogleGenAI } = require('@google/genai');

// 🔗 IMPORTATION DES BANQUES DE DONNÉES (data.js)
const {
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
} = require('./data');

// ==========================================
// 🤖 INITIALISATION GEMINI IA
// ==========================================
const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

async function genererReponseGemini(prompt) {
  if (!ai) {
    return "⚠️ La variable GEMINI_API_KEY n'est pas configurée dans l'onglet Environment sur Render.";
  }
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text;
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
      const estGroupe = remoteJid.endsWith('@g.us');

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

      const cleanText = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();
      const lowerText = cleanText.toLowerCase();

      // 👋 SALUTATION AUTOMATIQUE DANS LES GROUPES POUR LES MEMBRES ENREGISTRÉS
      if (estGroupe && profilsJoueurs[senderJid] && !membresSalues.has(`${remoteJid}_${senderJid}`)) {
        membresSalues.add(`${remoteJid}_${senderJid}`);
        const nomJoueur = profilsJoueurs[senderJid];
        await envoyerAvecDelai(sock, remoteJid, { 
          text: `👋 Bienvenue **${nomJoueur}** ! Ravi de te voir par ici ! ⚡` 
        }, { quoted: msg }, msg);
      }

      // 🔑 VÉRIFICATION DU MOT DE PASSE POUR LES NOTES
      if (sessionsMotDePasse[senderJid]) {
        delete sessionsMotDePasse[senderJid];

        if (cleanText === '@ashley') {
          const userNotes = mesNotes[senderJid] || [];
          let listeText = "🔓 *ACCÈS AUTORISÉ - VOS NOTES :*\n\n";
          userNotes.forEach((n, idx) => {
            listeText += `*${idx + 1}.* ${n}\n`;
          });
          listeText += "\n👉 Tapez **.clearnotes** pour tout effacer.";

          await envoyerAvecDelai(sock, remoteJid, { text: listeText }, { quoted: msg }, msg);
        } else {
          await envoyerAvecDelai(sock, remoteJid, { 
            text: "❌ *MOT DE PASSE INCORRECT !*\n\n🔒 Session fermée." 
          }, { quoted: msg }, msg);
        }
        return;
      }

      const jeu = partiesEnCours[remoteJid];
      demarrerTimerInactivite(sock, remoteJid);

      // 📜 MENU PRINCIPAL
      if (lowerText === '.menu' || lowerText === 'menu') {
        const nomAffiche = profilsJoueurs[senderJid] ? profilsJoueurs[senderJid] : "Joueur";
        const menuText = `
⚡ *━━━ 🤖 TITAN BOT ULTIMATE 🤖 ━━━* ⚡
👤 *Bienvenue ${nomAffiche} !*

👤 *──────── 📇 PROFIL & IDENTITÉ ────────*
🔹 *.inscrire [Nom]* ➔ *S'enregistrer auprès du Bot*
🔹 *.pseudonyme [Nouveau Nom]* ➔ *Modifier son nom / surnom*

📝 *──────── 📌 NOTES & RAPPELS ────────*
🔹 *.note [texte]* ➔ *Ajouter une note*
🔹 *.notes* ➔ *Afficher mes notes (Protégé)*
🔹 *.clearnotes* ➔ *Effacer toutes mes notes*

🐾 *──────── 🐶 ANIMAL DE COMPAGNIE ────────*
🔹 *.animal* ➔ *Adopter / Voir mon animal*
🔹 *.nourrir* ➔ *Nourrir son animal*

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
🎲 *.de* ➔ *Jeu de Dé Ultra*
🚪 *.labyrinthe* ➔ *Le Labyrinthe des Portes Mortelles*
🔴 *.feurouge* ➔ *Squid Game Extreme*
💀 *.roulette* ➔ *Roulette Russe Tactical*
🔢 *.chiffremystere* ➔ *Devine le Nombre (Indice Pro)*

📋 *──────── 📌 CONTROLES DU JEU ────────*
🚀 *.lancer* ➔ *Démarrer la session*
🔄 *.restart* ➔ *Relancer le dernier jeu*
🛑 *.stop* ➔ *Arrêter et réinitialiser*
⚡ *━━━━━━━━━━━━━━━━━━━━━━━━━* ⚡`;

        await envoyerAvecDelai(sock, remoteJid, { text: menuText }, { quoted: msg }, msg);
        return;
      }

      // 👤 INSCRIPTION & ENREGISTREMENT DU NOM PERMANENT
      if (lowerText.startsWith('.inscrire')) {
        const nomEntre = cleanText.replace(/^\.inscrire\s*/i, '').trim();

        if (!nomEntre) {
          await envoyerAvecDelai(sock, remoteJid, { 
            text: "⚠️ *ATTENTION !* Choisissez bien votre nom car je vais le retenir définitivement !\n\nExemple : `.inscrire Alex`" 
          }, { quoted: msg }, msg);
          return;
        }

        profilsJoueurs[senderJid] = nomEntre;

        if (jeu && jeu.statut === 'INSCRIPTION') {
          if (!jeu.joueurs.some(j => j.jid === senderJid)) {
            jeu.joueurs.push({ jid: senderJid, nom: nomEntre, elimine: false, bouclier: true });
          }
        }

        await envoyerAvecDelai(sock, remoteJid, { 
          text: `🎉 *PROFIL ENREGISTRÉ !*\n\nBienvenue **${nomEntre}** ! Je me souviendrai désormais de vous.\n\n💡 *Astuce :* Tapez \`.pseudonyme [Nouveau Nom]\` pour modifier votre nom ou surnom.` 
        }, { quoted: msg }, msg);
        return;
      }

      // ✏️ CHANGEMENT DE NOM OU SURNOM
      if (lowerText.startsWith('.pseudonyme') || lowerText.startsWith('.pseudo')) {
        const nouveauNom = cleanText.replace(/^(\.pseudonyme|\.pseudo)\s*/i, '').trim();

        if (!nouveauNom) {
          await envoyerAvecDelai(sock, remoteJid, { 
            text: "⚠️ Précisez votre nouveau nom ou surnom. Exemple : `.pseudonyme Alex The King`" 
          }, { quoted: msg }, msg);
          return;
        }

        const ancienNom = profilsJoueurs[senderJid] || "Joueur";
        profilsJoueurs[senderJid] = nouveauNom;

        if (jeu && jeu.joueurs) {
          const j = jeu.joueurs.find(j => j.jid === senderJid);
          if (j) j.nom = nouveauNom;
        }

        await envoyerAvecDelai(sock, remoteJid, { 
          text: `🔄 *PROFIL MIS À JOUR !*\n\nAncien nom : **${ancienNom}**\nNouveau nom / surnom : **${nouveauNom}**` 
        }, { quoted: msg }, msg);
        return;
      }

      // 📝 GESTION DES NOTES
      if (lowerText.startsWith('.note ')) {
        const texteNote = cleanText.replace(/^\.note\s*/i, '').trim();
        if (!texteNote) {
          await envoyerAvecDelai(sock, remoteJid, { text: "⚠️ Précise le texte à enregistrer. Exemple : `.note Acheter du pain`" }, { quoted: msg }, msg);
          return;
        }

        if (!mesNotes[senderJid]) mesNotes[senderJid] = [];
        mesNotes[senderJid].push(texteNote);

        await envoyerAvecDelai(sock, remoteJid, { 
          text: `✅ *NOTE ENREGISTRÉE !*\n\n📌 "*${texteNote}*"\n\n👉 Tapez **.notes** pour y accéder.` 
        }, { quoted: msg }, msg);
        return;
      }

      if (lowerText === '.notes') {
        const userNotes = mesNotes[senderJid] || [];
        if (userNotes.length === 0) {
          await envoyerAvecDelai(sock, remoteJid, { text: "📭 Vous n'avez aucune note enregistrée. Tapez `.note [texte]` pour en ajouter une !" }, { quoted: msg }, msg);
          return;
        }

        sessionsMotDePasse[senderJid] = true;

        await envoyerAvecDelai(sock, remoteJid, { 
          text: "🔒 *ACCÈS SÉCURISÉ AUX NOTES*\n\nVeuillez entrer le mot de passe pour déverrouiller vos notes :" 
        }, { quoted: msg }, msg);
        return;
      }

      if (lowerText === '.clearnotes') {
        mesNotes[senderJid] = [];
        await envoyerAvecDelai(sock, remoteJid, { text: "🗑️ Toutes vos notes ont été effacées avec succès !" }, { quoted: msg }, msg);
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
            text: `💀 *VOTRE ANIMAL EST MORT DE FAMINE !*\n\nVotre **${pet.nom}** n'a pas été nourri à temps... 🪦\n\n👉 Tapez *.animal* à nouveau pour en adopter un autre.` 
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

      // 🚀 DECLENCHEURS DE JEUX
      if (lowerText === '.de') return declencherJeuDe(sock, remoteJid, msg);
      if (lowerText === '.labyrinthe') return declencherJeuLabyrinthe(sock, remoteJid, msg);
      if (lowerText === '.feurouge') return declencherJeuFeuRouge(sock, remoteJid, msg);
      if (lowerText === '.roulette') return declencherJeuRoulette(sock, remoteJid, msg);
      if (lowerText === '.chiffremystere') return declencherJeuChiffre(sock, remoteJid, msg);

      // 🚀 LANCEMENT DES SESSIONS DE JEUX
      if (lowerText === '.lancer') {
        if (!jeu || jeu.statut !== 'INSCRIPTION') return;

        if (profilsJoueurs[senderJid] && !jeu.joueurs.some(j => j.jid === senderJid)) {
          jeu.joueurs.push({ jid: senderJid, nom: profilsJoueurs[senderJid], elimine: false, bouclier: true, score: 0 });
        }

        if (jeu.joueurs.length === 0) {
          await envoyerAvecDelai(sock, remoteJid, { 
            text: "⚠️ Aucun joueur inscrit ! Enregistrez-vous d'abord avec `.inscrire [VotreNom]` !" 
          }, { quoted: msg }, msg);
          return;
        }

        // 🎲 BOOST DÉ (SYSTÈME DE POINTS + MULTIPLICATEURS)
        if (jeu.type === 'DE') {
          jeu.statut = 'EN_COURS';
          jeu.indexTour = 0;
          jeu.objectif = Math.floor(Math.random() * 6) + 1;
          jeu.mult = Math.floor(Math.random() * 3) + 1; // Multiplicateur de score aléatoire
          const joueurActuel = jeu.joueurs[jeu.indexTour];
          await envoyerAvecDelai(sock, remoteJid, { 
            text: `🎯 *JEU DU DÉ ULTRA STARTE !*\n\n📌 *OBJECTIF :* Tirer un **${jeu.objectif}** !\n🔥 *Multiplicateur de Points :* x${jeu.mult}\n\n👉 C'est le tour de **${joueurActuel.nom}**. Tapez *@lancer* !` 
          }, { quoted: msg }, msg);
          return;
        }

        // 🔴 BOOST FEU ROUGE
        if (jeu.type === 'FEU_ROUGE') {
          jeu.statut = 'EN_COURS';
          lancerMancheFeuRouge(sock, remoteJid);
          return;
        }

        // 💀 BOOST ROULETTE (SYSTÈME BOUCLIER TACTIQUE)
        if (jeu.type === 'ROULETTE') {
          jeu.statut = 'EN_COURS';
          jeu.indexTour = 0;
          jeu.chambresRestantes = 6;
          const premier = jeu.joueurs[0];
          await envoyerAvecDelai(sock, remoteJid, { 
            text: `💀 *ROULETTE RUSSE TACTIQUE*\n\n🔫 1 Balle / ${jeu.chambresRestantes} chambres.\n🛡️ *Bonus :* Chaque joueur possède **1 Bouclier Pare-Balles** !\n\n👉 Au tour de **${premier.nom}**. Tapez *@tirer* !` 
          }, { quoted: msg }, msg);
          return;
        }

        // 🔢 BOOST CHIFFRE MYSTÈRE (INDICES CHAUD / FROID & SCORE)
        if (jeu.type === 'CHIFFRE') {
          jeu.statut = 'EN_COURS';
          await envoyerAvecDelai(sock, remoteJid, { 
            text: `🔢 *CHIFFRE MYSTÈRE ULTRA (1-100)*\n\n🎯 Devinez le nombre ! Vous recevrez des indices de température 🔥/🧊 pour vous guider.\n\nProposez directement votre nombre dans le tchat !` 
          }, { quoted: msg }, msg);
          return;
        }
      }

      // 🎯 EN COURS DE JEU
      if (jeu && jeu.statut === 'EN_COURS') {

        // 🎲 DÉ BOOSTÉ
        if (jeu.type === 'DE' && lowerText === '@lancer') {
          const joueurActuel = jeu.joueurs[jeu.indexTour];
          if (senderJid !== joueurActuel.jid) {
            await envoyerAvecDelai(sock, remoteJid, { text: `⏳ Ce n'est pas ton tour ! Tour de **${joueurActuel.nom}**.` }, { quoted: msg }, msg);
            return;
          }

          const tirage = Math.floor(Math.random() * 6) + 1;
          if (tirage === jeu.objectif) {
            joueurActuel.score = (joueurActuel.score || 0) + (100 * jeu.mult);
            partiesEnCours[remoteJid] = { dernierType: 'DE' };
            await envoyerAvecDelai(sock, remoteJid, { 
              text: `🎲 **${joueurActuel.nom}** a obtenu un **${tirage}** !\n\n🎉 *VICTOIRE CRITIQUE !* Objectif atteint !\n⭐ Points gagnés : **+${100 * jeu.mult} pts** !\n\n🔄 Tapez *.restart* pour rejouer !` 
            }, { quoted: msg }, msg);
          } else {
            jeu.indexTour = (jeu.indexTour + 1) % jeu.joueurs.length;
            const prochainJoueur = jeu.joueurs[jeu.indexTour];
            await envoyerAvecDelai(sock, remoteJid, { 
              text: `🎲 **${joueurActuel.nom}** a tiré un **${tirage}** (Besoin du : ${jeu.objectif}).\n\n👉 Au tour de **${prochainJoueur.nom}**. Tapez *@lancer* !` 
            }, { quoted: msg }, msg);
          }
          return;
        }

        // 🚪 LABYRINTHE
        if (jeu.type === 'LABYRINTHE' && cleanText.startsWith('@porte')) {
          const choix = cleanText.replace(/^@porte\s*/i, '').trim().toLowerCase();

          if (!choix) {
            await envoyerAvecDelai(sock, remoteJid, { text: "⚠️ Précise la couleur. Exemple : *@porte rouge*" }, { quoted: msg }, msg);
            return;
          }

          if (choix === jeu.bonnePorte) {
            jeu.fioles += 1;
            partiesEnCours[remoteJid] = { dernierType: 'LABYRINTHE' };

            await envoyerAvecDelai(sock, remoteJid, { 
              text: `🎉 *EXCELLENT CHOIX !* Tu as franchi la bonne porte et échappé au Labyrinthe ! 🏆\n\n🧪 *RÉCOMPENSE :* Tu gagnes **+1 Fiole de seconde chance** !\n\n🔄 Tapez *.restart* pour retenter !` 
            }, { quoted: msg }, msg);
            return;
          } 

          const mortAleatoire = jeu.pieges[Math.floor(Math.random() * jeu.pieges.length)];

          if (jeu.fioles > 0) {
            jeu.fioles -= 1;

            const couleurs = ['rouge', 'bleue', 'verte', 'jaune', 'noire', 'blanche', 'violette'];
            jeu.bonnePorte = couleurs[Math.floor(Math.random() * couleurs.length)];
            let nouvelleMauvaise = couleurs[Math.floor(Math.random() * couleurs.length)];
            while (nouvelleMauvaise === jeu.bonnePorte) {
              nouvelleMauvaise = couleurs[Math.floor(Math.random() * couleurs.length)];
            }

            const p1 = Math.random() < 0.5 ? jeu.bonnePorte : nouvelleMauvaise;
            const p2 = p1 === jeu.bonnePorte ? nouvelleMauvaise : jeu.bonnePorte;

            await envoyerAvecDelai(sock, remoteJid, { 
              text: `💥 *PIÈGE DÉCLENCHÉ !*\n${mortAleatoire}\n\n🧪 *RÉANIMATION !* Ta fiole de seconde chance t'a sauvé la vie !\n⚠️ Fioles restantes : **${jeu.fioles}**\n\nNouvelles portes disponibles :\n🔹 Porte **${p1}**\n🔹 Porte **${p2}**\n\n👉 Tapez *@porte ${p1}* ou *@porte ${p2}* !` 
            }, { quoted: msg }, msg);
          } else {
            partiesEnCours[remoteJid] = { dernierType: 'LABYRINTHE' };
            await envoyerAvecDelai(sock, remoteJid, { 
              text: `💥 *PIÈGE DÉCLENCHÉ !*\n${mortAleatoire}\n\n💀 *GAME OVER !* Tu es éliminé !\n\n🔄 Tapez *.restart* pour rejouer !` 
            }, { quoted: msg }, msg);
          }
          return;
        }

        // 💀 ROULETTE BOOSTÉE
        if (jeu.type === 'ROULETTE' && lowerText === '@tirer') {
          const joueurActuel = jeu.joueurs[jeu.indexTour];
          if (senderJid !== joueurActuel.jid) {
            await envoyerAvecDelai(sock, remoteJid, { text: `⏳ C'est à **${joueurActuel.nom}** de tirer !` }, { quoted: msg }, msg);
            return;
          }

          const chanceAcoups = 1 / jeu.chambresRestantes;
          if (Math.random() < chanceAcoups) {
            if (joueurActuel.bouclier) {
              joueurActuel.bouclier = false;
              jeu.chambresRestantes = 6; // Rechargement
              await envoyerAvecDelai(sock, remoteJid, { 
                text: `💥 *PAN !* Le coup est parti... MAIS **${joueurActuel.nom}** avait un 🛡️ *BOUCLIER PARE-BALLES* !\n\nLe bouclier est détruit mais vous êtes en vie ! Le barillet est rechargé (6 chambres).\n👉 @tirer à nouveau !` 
              }, { quoted: msg }, msg);
            } else {
              partiesEnCours[remoteJid] = { dernierType: 'ROULETTE' };
              await envoyerAvecDelai(sock, remoteJid, { text: `💥 *PAN !* **${joueurActuel.nom}** n'avait plus de bouclier ! Élimination directe !\n\n🔄 Tapez *.restart* pour rejouer !` }, { quoted: msg }, msg);
            }
          } else {
            jeu.chambresRestantes = Math.max(1, jeu.chambresRestantes - 1);
            jeu.indexTour = (jeu.indexTour + 1) % jeu.joueurs.length;
            const prochain = jeu.joueurs[jeu.indexTour];
            await envoyerAvecDelai(sock, remoteJid, { 
              text: `⚙️ *CLIC !* Chambre vide pour **${joueurActuel.nom}**.\n📊 Risque tour suivant : 1/${jeu.chambresRestantes}\n\n👉 Tour de **${prochain.nom}**. Tapez *@tirer* !` 
            }, { quoted: msg }, msg);
          }
          return;
        }

        // 🔢 CHIFFRE MYSTÈRE BOOSTÉ
        if (jeu.type === 'CHIFFRE' && !isNaN(cleanText)) {
          const prop = parseInt(cleanText, 10);
          jeu.essais = (jeu.essais || 0) + 1;
          const ecart = Math.abs(prop - jeu.secret);

          if (prop === jeu.secret) {
            partiesEnCours[remoteJid] = { dernierType: 'CHIFFRE' };
            const nomGagnant = profilsJoueurs[senderJid] || "Joueur";
            await envoyerAvecDelai(sock, remoteJid, { 
              text: `🎉 *VICTOIRE DE ${nomGagnant.toUpperCase()} !*\n\n🎯 Le chiffre mystère était bien **${jeu.secret}** !\n⏱️ Trouvé en **${jeu.essais} tentative(s)** !\n\n🔄 Tapez *.restart* pour rejouer !` 
            }, { quoted: msg }, msg);
          } else {
            let tempIndice = "";
            if (ecart <= 5) tempIndice = "🔥 *BRÛLANT !* Tu piques le nombre !";
            else if (ecart <= 15) tempIndice = "♨️ *CHAUD !* Très proche !";
            else if (ecart <= 30) tempIndice = "🌤️ *TIÈDE !* Tu approches.";
            else tempIndice = "🧊 *FROID !* Tu en es encore loin.";

            const direction = prop < jeu.secret ? "📈 *C'est PLUS GRAND !*" : "📉 *C'est PLUS PETIT !*";

            await envoyerAvecDelai(sock, remoteJid, { 
              text: `${direction}\n${tempIndice}\n\n📊 Essai n°${jeu.essais}` 
            }, { quoted: msg }, msg);
          }
          return;
        }

        // 🔴 SQUID GAME BOOSTÉ (INSENSIBLE AUX MAJUSCULES & ORTHOGRAPHE STRICTE)
        if (jeu.type === 'FEU_ROUGE' && jeu.attenteReponse && cleanText.startsWith('@')) {
          const reponseSaisie = cleanText.substring(1).trim();
          const motProposeLower = reponseSaisie.toLowerCase();
          const motAttenduLower = jeu.motAValider.toLowerCase();

          // Comparaison insensible aux majuscules
          if (motProposeLower === motAttenduLower) {
            const j = jeu.joueurs.find(j => j.jid === senderJid);
            if (j && !j.aRepondu && !j.elimine) {
              j.aRepondu = true;
              await envoyerAvecDelai(sock, remoteJid, { text: `⚡ **${j.nom}** a franchi la ligne en sécurité !` }, { quoted: msg }, msg);
            }
          } else {
            // Mauvaise orthographe
            const j = jeu.joueurs.find(j => j.jid === senderJid);
            if (j && !j.elimine) {
              j.elimine = true;
              await envoyerAvecDelai(sock, remoteJid, { 
                text: `❌ **${j.nom}** a été éliminé ! (Erreur d'orthographe : tu as écrit "${reponseSaisie}" au lieu de "${jeu.motAValider}")` 
              }, { quoted: msg }, msg);
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
    text: `🎲 *JEU DU DÉ ULTRA*\n\n👉 Tapez *.inscrire [Nom]* pour vous enregistrer !\n👉 Tapez *.lancer* pour démarrer !` 
  }, { quoted: msg }, msg);
}

function declencherJeuLabyrinthe(sock, remoteJid, msg) {
  reinitialiserJeu(remoteJid);

  const piegesMorts = [
    "🌋 Tu es tombé dans un volcan en fusion !",
    "🐍 Tu as atterri dans un nid de cobras venimeux !",
    "🌌 Tu as été expulsé dans le vide spatial !",
    "🕳️ Tu as été englouti par un piège mouvant !"
  ];

  const couleurs = ['rouge', 'bleue', 'verte', 'jaune', 'noire', 'blanche'];
  const couleurBonne = couleurs[Math.floor(Math.random() * couleurs.length)];
  let couleurMauvaise = couleurs[Math.floor(Math.random() * couleurs.length)];
  while (couleurMauvaise === couleurBonne) {
    couleurMauvaise = couleurs[Math.floor(Math.random() * couleurs.length)];
  }

  partiesEnCours[remoteJid] = {
    type: 'LABYRINTHE',
    statut: 'EN_COURS',
    fioles: 1,
    bonnePorte: couleurBonne,
    pieges: piegesMorts
  };

  const porte1 = Math.random() < 0.5 ? couleurBonne : couleurMauvaise;
  const porte2 = porte1 === couleurBonne ? couleurMauvaise : couleurBonne;

  return envoyerAvecDelai(sock, remoteJid, { 
    text: `🚪 *LE LABYRINTHE DES PORTES*\n\nDeux portes mystérieuses se dressent devant toi :\n🔹 Porte **${porte1}**\n🔹 Porte **${porte2}**\n\n🧪 *ÉQUIPEMENT :* 1 Fiole de seconde chance offerte !\n\n👉 Choisis : *@porte ${porte1}* ou *@porte ${porte2}* !` 
  }, { quoted: msg }, msg);
}

function declencherJeuFeuRouge(sock, remoteJid, msg) {
  reinitialiserJeu(remoteJid);
  partiesEnCours[remoteJid] = { type: 'FEU_ROUGE', statut: 'INSCRIPTION', joueurs: [] };
  return envoyerAvecDelai(sock, remoteJid, { 
    text: `🔴 *SQUID GAME EXTREME*\n\n👉 Tapez *.inscrire [Nom]* pour participer.\n👉 Tapez *.lancer* pour lancer la manche !` 
  }, { quoted: msg }, msg);
}

function declencherJeuRoulette(sock, remoteJid, msg) {
  reinitialiserJeu(remoteJid);
  partiesEnCours[remoteJid] = { type: 'ROULETTE', statut: 'INSCRIPTION', joueurs: [] };
  return envoyerAvecDelai(sock, remoteJid, { 
    text: `💀 *ROULETTE RUSSE TACTIQUE*\n\n👉 Tapez *.inscrire [Nom]* pour rejoindre.\n👉 Tapez *.lancer* pour armer le revolver !` 
  }, { quoted: msg }, msg);
}

function declencherJeuChiffre(sock, remoteJid, msg) {
  reinitialiserJeu(remoteJid);
  partiesEnCours[remoteJid] = { type: 'CHIFFRE', statut: 'INSCRIPTION', joueurs: [], secret: Math.floor(Math.random() * 100) + 1, essais: 0 };
  return envoyerAvecDelai(sock, remoteJid, { 
    text: `🔢 *CHIFFRE MYSTÈRE ULTRA (1 À 100)*\n\n👉 Tapez *.lancer* pour démarrer le défi !` 
  }, { quoted: msg }, msg);
}

// ==========================================
// 🔴 MOTEUR SQUID GAME BOOSTÉ
// ==========================================
async function lancerMancheFeuRouge(sock, remoteJid) {
  const jeu = partiesEnCours[remoteJid];
  if (!jeu || jeu.type !== 'FEU_ROUGE') return;

  const mot = MOTS_SQUID[Math.floor(Math.random() * MOTS_SQUID.length)];
  jeu.motAValider = mot;
  jeu.attenteReponse = true;
  jeu.joueurs.forEach(j => j.aRepondu = false);

  let tempsSec = 4 + Math.floor(Math.random() * 3); 

  await envoyerAvecDelai(sock, remoteJid, { 
    text: `🔴 *FEU ROUGE !*\n\n👉 Tapez en vitesse *@${mot}* dans le tchat !\n⏰ Chrono : **${tempsSec} secondes** !` 
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
      await envoyerAvecDelai(sock, remoteJid, { text: `💥 *ÉLIMINATION TOTALE !* Personne n'a réagi à temps !\n\n🔄 Tapez *.restart* pour rejouer !` });
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
