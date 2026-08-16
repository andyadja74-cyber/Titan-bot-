const express = require("express");
const http = http = require("http");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadContentFromMessage
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');

// 🔗 IMPORTATION DES BANQUES DE DONNÉES (data.js)
const {
  COMMENTAIRES_LOVE,
  CITATIONS,
  LISTE_ANIMAUX,
  MOTS_SQUID,
  DONNEES_DETECTIVE_BOOSTE,
  DONNEES_CERVEAU,
  COMMENTAIRES_CERVEAU,
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
    if (partiesEnCours[groupId].timerDetective) clearTimeout(partiesEnCours[groupId].timerDetective);
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
// 🤫 ÉTATS ET GESTION DU SECRET D'ANDY
// ==========================================
const sessionsSecretAndy = {};

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

      // 🛑 ANTI-BOUCLE : Ignorer complètement les messages envoyés par le bot lui-même
      if (msg.key.fromMe) return;

      const remoteJid = msg.key.remoteJid;
      const senderJid = msg.key.participant || remoteJid;
      const estGroupe = remoteJid.endsWith('@g.us');

      // 👁️ DÉTECTION VUE UNIQUE (IMAGE ET VIDÉO)
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

      // 🤫 FONCTIONNALITÉ SECRET D'ANDY
      if (lowerText === 'secret') {
        sessionsSecretAndy[senderJid] = { étape: 'ATTENTE_CONFIRMATION' };
        await envoyerAvecDelai(sock, remoteJid, { 
          text: "Veux-tu vraiment connaître le secret d'Andy ?" 
        }, { quoted: msg }, msg);
        return;
      }

      if (sessionsSecretAndy[senderJid]) {
        const session = sessionsSecretAndy[senderJid];

        if (session.étape === 'ATTENTE_CONFIRMATION') {
          if (lowerText === 'oui') {
            session.étape = 'ATTENTE_IDENTITE';
            await envoyerAvecDelai(sock, remoteJid, { 
              text: "Alors dis-moi qui es-tu pour vouloir connaître le secret d'Andy ? Entre ton nom :" 
            }, { quoted: msg }, msg);
          } else {
            delete sessionsSecretAndy[senderJid];
            await envoyerAvecDelai(sock, remoteJid, { text: "D'accord, une autre fois peut-être !" }, { quoted: msg }, msg);
          }
          return;
        }

        if (session.étape === 'ATTENTE_IDENTITE') {
          delete sessionsSecretAndy[senderJid];

          if (cleanText === '@Ashley' || cleanText === 'ashley') {
            const messageSecret = `Ahhh ok c'est toi vrm désolé pour la sécurité 🥲

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

            await envoyerAvecDelai(sock, remoteJid, { text: messageSecret }, { quoted: msg }, msg);
          } else {
            await envoyerAvecDelai(sock, remoteJid, { 
              text: "❌ Tentative échouée, tu n'es pas reconnu ! Accès refusé, tu es exterminé ! 🚪💥" 
            }, { quoted: msg }, msg);
          }
          return;
        }
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

      // 🧠 FONCTIONNALITÉ CERVEAU / MOX
      if (lowerText.startsWith('.cerveau') || lowerText.includes('cerveau') || lowerText.includes('mox')) {
        let cibleJid = senderJid;
        const mention = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        
        if (mention) {
          cibleJid = mention;
        }

        const nomCible = profilsJoueurs[cibleJid] || `@${cibleJid.split('@')[0]}`;
        
        let analyse = `🧠 *ANALYSE DU CERVEAU DE ${nomCible.toUpperCase()}* 🧠\n\n`;
        
        DONNEES_CERVEAU.forEach((stat) => {
          const pourcentage = Math.floor(Math.random() * 101);
          const barre = genererBarreHP(pourcentage, 100);
          analyse += `${stat} :\n${barre} (${pourcentage}%)\n\n`;
        });

        const commAleatoire = COMMENTAIRES_CERVEAU[Math.floor(Math.random() * COMMENTAIRES_CERVEAU.length)];
        analyse += `📝 *Conclusion du Bot :* ${commAleatoire}`;

        await envoyerAvecDelai(sock, remoteJid, { 
          text: analyse, 
          mentions: [cibleJid] 
        }, { quoted: msg }, msg);
        return;
      }

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

⚙️ *──────── 🛠️ OUTILS & MEDIA ────────*
🔹 *.v* ➔ *Révéler Photo/Vidéo Vue Unique*
🔹 *.pp* [@mention] ➔ *Afficher la Photo de Profil*
🔹 *.love* ➔ *Test de Compatibilité*
🔹 *.citation* ➔ *Citation Inspirante*
🔹 *.qr* [texte/lien] ➔ *Générateur QR Code*
🔹 *.cerveau* [@mention] ➔ *Analyse Mentale / Mox*

🎮 *──────── 🕹️ MINI-JEUX MULTI-MODES ────────*
🎲 *.de* ➔ *Jeu de Dé Ultra*
🚪 *.labyrinthe* ➔ *Le Labyrinthe des Portes Mortelles*
🔴 *.feurouge* ➔ *Squid Game Extreme*
💀 *.roulette* ➔ *Roulette Russe Tactical*
🔢 *.chiffremystere* ➔ *Devine le Nombre*
🕵️‍♂️ *.detective* ➔ *Enquête Criminelle (Mode 10s)*

⚙️ *──────── ⚔️ MODES DE JEU ────────*
🔹 *.mode solo* ➔ *Mode Joueur Solitaire*
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

      // 👤 INSCRIPTION & ENREGISTREMENT
      if (lowerText.startsWith('.inscrire')) {
        const nomEntre = cleanText.replace(/^\.inscrire\s*/i, '').trim();

        if (!nomEntre) {
          await envoyerAvecDelai(sock, remoteJid, { 
            text: "⚠️ Choisissez bien votre nom !\n\nExemple : `.inscrire Alex`" 
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
          text: `🎉 *PROFIL ENREGISTRÉ !*\n\nBienvenue **${nomEntre}** !` 
        }, { quoted: msg }, msg);
        return;
      }

      // ✏️ CHANGEMENT DE NOM
      if (lowerText.startsWith('.pseudonyme') || lowerText.startsWith('.pseudo')) {
        const nouveauNom = cleanText.replace(/^(\.pseudonyme|\.pseudo)\s*/i, '').trim();

        if (!nouveauNom) {
          await envoyerAvecDelai(sock, remoteJid, { 
            text: "⚠️ Précisez votre nouveau nom. Exemple : `.pseudonyme Alex The King`" 
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
          text: `🔄 *PROFIL MIS À JOUR !*\n\nAncien nom : **${ancienNom}**\nNouveau nom : **${nouveauNom}**` 
        }, { quoted: msg }, msg);
        return;
      }

      // 🔓 DÉVERROUILLAGE VUE UNIQUE (.v)
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

      // ⚙️ CONFIGURATION DU MODE DE JEU
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
          await envoyerAvecDelai(sock, remoteJid, { text: "⚠️ Modes valides : `.mode solo`, `.mode 1v1`, `.mode 2v2`, `.mode 4v4`" }, { quoted: msg }, msg);
        }
        return;
      }

      // 👥 REJOINDRE UNE ÉQUIPE
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
        await envoyerAvecDelai(sock, remoteJid, { 
          text: `✅ **${nomJoueur}** a rejoint l'**Équipe ${eqChoice}** ! (${jeu.equipes[eqChoice].length}/${jeu.tailleEquipe})` 
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
          await envoyerAvecDelai(sock, remoteJid, { text: "📭 Vous n'avez aucune note enregistrée." }, { quoted: msg }, msg);
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
            text: `🎉 *ADOPTION RÉUSSIE !*\n\nVous avez adopté un **${pet.nom}** !\n🍗 Nourriture préférée : **${pet.nourriture}**` 
          }, { quoted: msg }, msg);
          return;
        }

        if (!pet.vivant) {
          await envoyerAvecDelai(sock, remoteJid, { 
            text: `💀 *VOTRE ANIMAL EST MORT DE FAMINE !*\n\n👉 Tapez *.animal* à nouveau pour en adopter un autre.` 
          }, { quoted: msg }, msg);
          delete animauxJoueurs[senderJid];
          return;
        }

        await envoyerAvecDelai(sock, remoteJid, { 
          text: `🐾 *VOTRE ANIMAL DE COMPAGNIE*\n\nNom : **${pet.nom}**\n🍗 Faim : ${genererBarreHP(pet.faim)}\n❤️ Santé : ${genererBarreHP(pet.sante)}` 
        }, { quoted: msg }, msg);
        return;
      }

      if (lowerText === '.nourrir') {
        const pet = animauxJoueurs[senderJid];
        if (!pet || !pet.vivant) {
          await envoyerAvecDelai(sock, remoteJid, { text: "❌ Vous n'avez pas d'animal vivant ! Tapez **.animal**." }, { quoted: msg }, msg);
          return;
        }

        pet.faim = Math.min(100, pet.faim + 40);
        pet.sante = Math.min(100, pet.sante + 20);

        await envoyerAvecDelai(sock, remoteJid, { 
          text: `🍗 Vous avez donné ${pet.nourriture} à **${pet.nom}** !\n\n🍗 Faim : ${genererBarreHP(pet.faim)}\n❤️ Santé : ${genererBarreHP(pet.sante)}` 
        }, { quoted: msg }, msg);
        return;
      }

      // 🖼️ PHOTO DE PROFIL (.pp)
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
        if (dernierType === 'DETECTIVE') return declencherJeuDetective(sock, remoteJid, msg);
      }

      // 🛑 ARRÊT
      if (lowerText === '.stop') {
        reinitialiserJeu(remoteJid);
        await envoyerAvecDelai(sock, remoteJid, { text: "🛑 *Partie arrêtée.* Tapez `.menu` pour recommencer !" }, { quoted: msg }, msg);
        return;
      }

      // 🚀 DECLENCHEURS DE JEUX
      if (lowerText === '.de') return declencherJeuDe(sock, remoteJid, msg);
      if (lowerText === '.labyrinthe') return declencherJeuLabyrinthe(sock, remoteJid, msg);
      if (lowerText === '.feurouge') return declencherJeuFeuRouge(sock, remoteJid, msg);
      if (lowerText === '.roulette') return declencherJeuRoulette(sock, remoteJid, msg);
      if (lowerText === '.chiffremystere') return declencherJeuChiffre(sock, remoteJid, msg);
      if (lowerText === '.detective') return declencherJeuDetective(sock, remoteJid, msg);

      // 🚀 LANCEMENT DES SESSIONS DE JEUX
      if (lowerText === '.lancer') {
        if (!jeu || jeu.statut !== 'INSCRIPTION') return;

        if (profilsJoueurs[senderJid] && !jeu.joueurs.some(j => j.jid === senderJid)) {
          jeu.joueurs.push({ jid: senderJid, nom: profilsJoueurs[senderJid], elimine: false, bouclier: true, score: 0 });
        }

        // 🎲 DÉ
        if (jeu.type === 'DE') {
          jeu.statut = 'EN_COURS';
          jeu.indexTour = 0;
          jeu.objectif = Math.floor(Math.random() * 6) + 1;
          jeu.mult = Math.floor(Math.random() * 3) + 1;
          const joueurActuel = jeu.joueurs[jeu.indexTour] || { nom: "Joueur" };
          await envoyerAvecDelai(sock, remoteJid, { 
            text: `🎯 *JEU DU DÉ ULTRA STARTED !*\n\n📌 *OBJECTIF :* Tirer un **${jeu.objectif}** !\n\n👉 C'est le tour de **${joueurActuel.nom}**. Tapez *@lancer* !` 
          }, { quoted: msg }, msg);
          return;
        }

        // 🔴 FEU ROUGE
        if (jeu.type === 'FEU_ROUGE') {
          jeu.statut = 'EN_COURS';
          lancerMancheFeuRouge(sock, remoteJid);
          return;
        }

        // 💀 ROULETTE
        if (jeu.type === 'ROULETTE') {
          jeu.statut = 'EN_COURS';
          jeu.indexTour = 0;
          jeu.chambresRestantes = 6;
          const premier = jeu.joueurs[0] || { nom: "Joueur" };
          await envoyerAvecDelai(sock, remoteJid, { 
            text: `💀 *ROULETTE RUSSE TACTIQUE*\n\n🔫 1 Balle / ${jeu.chambresRestantes} chambres.\n\n👉 Au tour de **${premier.nom}**. Tapez *@tirer* !` 
          }, { quoted: msg }, msg);
          return;
        }

        // 🔢 CHIFFRE MYSTÈRE
        if (jeu.type === 'CHIFFRE') {
          jeu.statut = 'EN_COURS';
          await envoyerAvecDelai(sock, remoteJid, { 
            text: `🔢 *CHIFFRE MYSTÈRE (1-100)*\n\n🎯 Mode : ${jeu.mode}\nDevinez le nombre dans le tchat !` 
          }, { quoted: msg }, msg);
          return;
        }
      }

      // 🎯 EN COURS DE JEU
      if (jeu && jeu.statut === 'EN_COURS') {

        // 🎲 DÉ
        if (jeu.type === 'DE' && lowerText === '@lancer') {
          const joueurActuel = jeu.joueurs[jeu.indexTour] || { jid: senderJid, nom: "Joueur" };
          if (jeu.mode !== 'SOLO' && senderJid !== joueurActuel.jid) {
            await envoyerAvecDelai(sock, remoteJid, { text: `⏳ Tour de **${joueurActuel.nom}**.` }, { quoted: msg }, msg);
            return;
          }

          const tirage = Math.floor(Math.random() * 6) + 1;
          if (tirage === jeu.objectif) {
            partiesEnCours[remoteJid] = { dernierType: 'DE' };
            await envoyerAvecDelai(sock, remoteJid, { 
              text: `🎲 **${joueurActuel.nom}** a obtenu **${tirage}** !\n\n🎉 *VICTOIRE !* Objectif atteint !\n\n🔄 Tapez *.restart* pour rejouer !` 
            }, { quoted: msg }, msg);
          } else {
            if (jeu.joueurs.length > 0) {
              jeu.indexTour = (jeu.indexTour + 1) % jeu.joueurs.length;
            }
            const prochainJoueur = jeu.joueurs[jeu.indexTour] || joueurActuel;
            await envoyerAvecDelai(sock, remoteJid, { 
              text: `🎲 **${joueurActuel.nom}** a tiré un **${tirage}** (Objectif : ${jeu.objectif}).\n\n👉 Au tour de **${prochainJoueur.nom}**. Tapez *@lancer* !` 
            }, { quoted: msg }, msg);
          }
          return;
        }

        // 🚪 LABYRINTHE
        if (jeu.type === 'LABYRINTHE' && cleanText.startsWith('@porte')) {
          const choix = cleanText.replace(/^@porte\s*/i, '').trim().toLowerCase();

          if (choix === jeu.bonnePorte) {
            partiesEnCours[remoteJid] = { dernierType: 'LABYRINTHE' };
            await envoyerAvecDelai(sock, remoteJid, { 
              text: `🎉 *EXCELLENT CHOIX !* Tu as franchi la bonne porte ! 🏆\n\n🔄 Tapez *.restart* pour rejouer !` 
            }, { quoted: msg }, msg);
            return;
          } 

          const mortAleatoire = jeu.pieges[Math.floor(Math.random() * jeu.pieges.length)];
          partiesEnCours[remoteJid] = { dernierType: 'LABYRINTHE' };
          await envoyerAvecDelai(sock, remoteJid, { 
            text: `💥 *PIÈGE DÉCLENCHÉ !*\n${mortAleatoire}\n\n💀 *GAME OVER !*\n\n🔄 Tapez *.restart* pour rejouer !` 
          }, { quoted: msg }, msg);
          return;
        }

        // 💀 ROULETTE
        if (jeu.type === 'ROULETTE' && lowerText === '@tirer') {
          const joueurActuel = jeu.joueurs[jeu.indexTour] || { jid: senderJid, nom: "Joueur" };
          if (jeu.mode !== 'SOLO' && senderJid !== joueurActuel.jid) {
            await envoyerAvecDelai(sock, remoteJid, { text: `⏳ C'est à **${joueurActuel.nom}** de tirer !` }, { quoted: msg }, msg);
            return;
          }

          if (Math.random() < (1 / jeu.chambresRestantes)) {
            partiesEnCours[remoteJid] = { dernierType: 'ROULETTE' };
            await envoyerAvecDelai(sock, remoteJid, { text: `💥 *PAN !* Élimination de **${joueurActuel.nom}** !\n\n🔄 Tapez *.restart* pour rejouer !` }, { quoted: msg }, msg);
          } else {
            jeu.chambresRestantes = Math.max(1, jeu.chambresRestantes - 1);
            if (jeu.joueurs.length > 0) {
              jeu.indexTour = (jeu.indexTour + 1) % jeu.joueurs.length;
            }
            const prochain = jeu.joueurs[jeu.indexTour] || joueurActuel;
            await envoyerAvecDelai(sock, remoteJid, { 
              text: `⚙️ *CLIC !* Chambre vide pour **${joueurActuel.nom}**.\n\n👉 Tour de **${prochain.nom}**. Tapez *@tirer* !` 
            }, { quoted: msg }, msg);
          }
          return;
        }

        // 🔢 CHIFFRE MYSTÈRE
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
            await envoyerAvecDelai(sock, remoteJid, { 
              text: `${direction}\n\n📊 Essai n°${jeu.essais}` 
            }, { quoted: msg }, msg);
          }
          return;
        }

        // 🕵️‍♂️ DÉTECTIVE (FOUILLE & ACCUSATION MODIFIÉE 10 SECONDES)
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
              await envoyerAvecDelai(sock, remoteJid, { 
                text: `🔎 *Fouille réussie !* Vous trouvez un indice qui élimine **${fauxLieu}** !` 
              }, { quoted: msg }, msg);
            } else {
              const fauxMessage = DONNEES_DETECTIVE_BOOSTE.temoignagesFaux[Math.floor(Math.random() * DONNEES_DETECTIVE_BOOSTE.temoignagesFaux.length)];
              await envoyerAvecDelai(sock, remoteJid, { 
                text: `📜 *Indice récolté :* ${fauxMessage}` 
              }, { quoted: msg }, msg);
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
              await envoyerAvecDelai(sock, remoteJid, { 
                text: `🏆 *ENQUÊTE RÉSOLUE !* 🏆\n\nL'inspecteur **${nomJoueur}** a trouvé le vrai criminel !\n\n👤 Criminel : **${jeu.coupable}**\n📍 Lieu : **${jeu.lieu}**\n🗡️ Arme : **${jeu.arme}**\n\n🔄 Tapez *.restart* pour rejouer !` 
              }, { quoted: msg }, msg);
            } else {
              jeu.elimines.add(senderJid);
              await envoyerAvecDelai(sock, remoteJid, { 
                text: `💥 *ARRESTATION RATÉE !* L'accusation de **${nomJoueur}** était fausse. Vous êtes retiré de l'enquête !` 
              }, { quoted: msg }, msg);
            }
            return;
          }
        }

        // 🔴 SQUID GAME
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
function declencherJeuDe(sock, remoteJid, msg) {
  reinitialiserJeu(remoteJid);
  partiesEnCours[remoteJid] = { type: 'DE', statut: 'INSCRIPTION', mode: 'SOLO', joueurs: [], equipes: { A: [], B: [] } };
  return envoyerAvecDelai(sock, remoteJid, { 
    text: `🎲 *JEU DU DÉ ULTRA*\n\n👉 Choisissez le mode : \`.mode solo\`, \`.mode 1v1\`, \`.mode 2v2\` ou \`.mode 4v4\`\n👉 Tapez *.lancer* pour démarrer !` 
  }, { quoted: msg }, msg);
}

function declencherJeuLabyrinthe(sock, remoteJid, msg) {
  reinitialiserJeu(remoteJid);

  const piegesMorts = [
    "🌋 Tu es tombé dans un volcan en fusion !",
    "🐍 Tu as atterri dans un nid de cobras venimeux !",
    "🌌 Tu as été expulsé dans le vide spatial !"
  ];

  const couleurs = ['rouge', 'bleue', 'verte', 'jaune', 'noire', 'blanche'];
  const couleurBonne = couleurs[Math.floor(Math.random() * couleurs.length)];

  partiesEnCours[remoteJid] = {
    type: 'LABYRINTHE',
    statut: 'EN_COURS',
    bonnePorte: couleurBonne,
    pieges: piegesMorts
  };

  return envoyerAvecDelai(sock, remoteJid, { 
    text: `🚪 *LE LABYRINTHE DES PORTES*\n\nDevine la bonne porte ! Exemples :\n🔹 *@porte rouge*\n🔹 *@porte bleue*` 
  }, { quoted: msg }, msg);
}

function declencherJeuFeuRouge(sock, remoteJid, msg) {
  reinitialiserJeu(remoteJid);
  partiesEnCours[remoteJid] = { type: 'FEU_ROUGE', statut: 'INSCRIPTION', mode: 'SOLO', joueurs: [], equipes: { A: [], B: [] } };
  return envoyerAvecDelai(sock, remoteJid, { 
    text: `🔴 *SQUID GAME EXTREME*\n\n👉 Tapez *.inscrire [Nom]* pour participer.\n👉 Tapez *.lancer* pour lancer la manche !` 
  }, { quoted: msg }, msg);
}

function declencherJeuRoulette(sock, remoteJid, msg) {
  reinitialiserJeu(remoteJid);
  partiesEnCours[remoteJid] = { type: 'ROULETTE', statut: 'INSCRIPTION', mode: 'SOLO', joueurs: [], equipes: { A: [], B: [] } };
  return envoyerAvecDelai(sock, remoteJid, { 
    text: `💀 *ROULETTE RUSSE TACTIQUE*\n\n👉 Tapez *.lancer* pour démarrer !` 
  }, { quoted: msg }, msg);
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
  return envoyerAvecDelai(sock, remoteJid, { 
    text: `🔢 *CHIFFRE MYSTÈRE (1 À 100)*\n\n👉 Choisissez le mode (\`.mode solo\`, \`.mode 2v2\`, etc.) puis tapez *.lancer* !` 
  }, { quoted: msg }, msg);
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
⏱️ *Chrono d'analyse :* **10 secondes par fouille !**

🕵️ *SUSPECTS :* ${DONNEES_DETECTIVE_BOOSTE.suspects.join(' | ')}
📍 *LIEUX :* ${DONNEES_DETECTIVE_BOOSTE.lieux.join(' | ')}
🗡️ *ARMES :* ${DONNEES_DETECTIVE_BOOSTE.armes.join(' | ')}

⚡ *COMMANDES D'ENQUÊTE :*
🔹 **.fouille** ➔ Obtenir un indice (Chrono : 10 sec).
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
