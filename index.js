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

// ==========================================
// 🧠 BASE DE DONNÉES EN MÉMOIRE (RAM)
// ==========================================
const partiesEnCours = {}; 
const timersInactivite = {};

// ==========================================
// 📚 DICTIONNAIRES DE DONNÉES
// ==========================================
const DONJONS_LABYRINTHE = [
  {
    nom: "🏛️ Le Labyrinthe du Minotaure",
    etapes: [
      { desc: "🚪 *Salle 1 :* Vous entrez dans une sombre galerie en pierre.\n👉 Répondez : *@est* ou *@ouest*", options: { est: 2, ouest: "piege" } },
      { desc: "🗝️ *Salle 2 :* Vous trouvez un coffre poussiéreux !\n👉 Répondez : *@prendre* pour ramasser la clé ou *@nord* pour avancer.", options: { prendre: "clef", nord: 3 } },
      { desc: "🧟 *Salle 3 :* Un Minotaure enragé surgit de l'ombre !\n👉 Répondez : *@attaquer* ou *@fuir* !", options: { attaquer: "combat", fuir: 1 } },
      { desc: "🏆 *SALLE DU TRÉSOR :* Labyrinthe vaincu avec succès !", options: "victoire" }
    ]
  },
  {
    nom: "🏜️ Le Temple Perdu d'Anubis",
    etapes: [
      { desc: "🚪 *Salle 1 :* Les hiéroglyphes s'illuminent.\n👉 Répondez : *@nord* ou *@sud*", options: { nord: 2, sud: "piege" } },
      { desc: "🧪 *Salle 2 :* Une fontaine magique stagne au centre.\n👉 Répondez : *@boire* (+30 HP) ou *@est* pour continuer.", options: { boire: "soin", est: 3 } },
      { desc: "🦂 *Salle 3 :* Des scorpions géants bloquent la porte !\n👉 Répondez : *@attaquer* ou *@est*", options: { attaquer: "combat", est: 4 } },
      { desc: "🏆 *SALLE DU TRÉSOR :* Le sarcophage divin s'ouvre ! Victoire !", options: "victoire" }
    ]
  }
];

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
    delete partiesEnCours[groupId];
    delete timersInactivite[groupId];
  }
}

function demarrerTimerInactivite(sock, groupId) {
  if (timersInactivite[groupId]) clearTimeout(timersInactivite[groupId]);
  timersInactivite[groupId] = setTimeout(async () => {
    reinitialiserJeu(groupId);
    await sock.sendMessage(groupId, { text: "🧹 *NETTOYAGE RAM :* Salon fermé pour inactivité." });
  }, 3 * 60 * 1000);
}

async function terminerManche(groupId, sock, messageVictoire) {
  const partie = partiesEnCours[groupId];
  if (!partie) return;

  partie.statut = 'ATTENTE_RELANCE';
  demarrerTimerInactivite(sock, groupId);

  let msgPrompt = `${messageVictoire}\n\n`;
  msgPrompt += `───────────────────\n`;
  msgPrompt += `🔄 *MANCHE TERMINÉE !*\n\n`;
  msgPrompt += `👉 Tapez **.jouer** pour relancer !\n`;
  msgPrompt += `👉 Tapez **.stop** pour fermer.`;

  await sock.sendMessage(groupId, { text: msgPrompt });
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

  await sock.sendMessage(remoteJid, { text: msgVert, mentions: [joueurActuel.jid] });

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

      await sock.sendMessage(remoteJid, { text: msgElim, mentions: [joueurActuel.jid] });
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
      console.log('🟢 BOT TITAN PRÊT (VUE UNIQUE + JEUX OPERA-TIONNELS) !');
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
      // 👁️ FONCTION : VUE UNIQUE (VIEW ONCE REVEAL) & PP
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
          await sock.sendMessage(remoteJid, { text: "⚠️ *Répondez à un message à vue unique (photo/vidéo) avec .vv !*" }, { quoted: msg });
          return;
        }

        const mediaType = viewOnceContent.imageMessage ? 'image' : viewOnceContent.videoMessage ? 'video' : null;
        if (!mediaType) {
          await sock.sendMessage(remoteJid, { text: "⚠️ Type de média à vue unique non supporté." }, { quoted: msg });
          return;
        }

        const mediaMessage = viewOnceContent.imageMessage || viewOnceContent.videoMessage;
        const stream = await downloadContentFromMessage(mediaMessage, mediaType);
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
          buffer = Buffer.concat([buffer, chunk]);
        }

        const caption = mediaMessage.caption ? `📩 *Vue Unique débloquée :*\n${mediaMessage.caption}` : "🔓 *Vue Unique débloquée !*";

        if (mediaType === 'image') {
          await sock.sendMessage(remoteJid, { image: buffer, caption: caption }, { quoted: msg });
        } else if (mediaType === 'video') {
          await sock.sendMessage(remoteJid, { video: buffer, caption: caption }, { quoted: msg });
        }
        return;
      }

      // 🖼️ PHOTO DE PROFIL (.pp / .getpp)
      if (lowerText.startsWith('.pp') || lowerText.startsWith('.getpp')) {
        let targetJid = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] 
                     || msg.message.extendedTextMessage?.contextInfo?.participant 
                     || senderJid;

        try {
          const ppUrl = await sock.profilePictureUrl(targetJid, 'image');
          await sock.sendMessage(remoteJid, { 
            image: { url: ppUrl }, 
            caption: `📸 *Photo de profil de :* @${targetJid.split('@')[0]}`,
            mentions: [targetJid]
          }, { quoted: msg });
        } catch (e) {
          await sock.sendMessage(remoteJid, { text: `❌ Impossible de récupérer la photo de profil de @${targetJid.split('@')[0]} (Privée ou absente).`, mentions: [targetJid] }, { quoted: msg });
        }
        return;
      }

      // ----------------------------------------------------
      // 🎯 ACTIONS DANS LES JEUX (AVEC @)
      // ----------------------------------------------------
      if (jeuEnCours && jeuEnCours.statut === 'EN_COURS' && cleanText.startsWith('@')) {
        demarrerTimerInactivite(sock, remoteJid);
        const action = cleanText.substring(1).trim().toLowerCase();

        // 🏛️ 1. LABYRINTHE RPG
        if (jeuEnCours.type.startsWith('LABYRINTHE')) {
          if (jeuEnCours.joueurActif && jeuEnCours.joueurActif.jid !== senderJid) {
            await sock.sendMessage(remoteJid, { 
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
                await terminerManche(remoteJid, sock, `💀 *MORT DANS LE LABYRINTHE !* @${senderJid.split('@')[0]} a déclenché un piège !`);
              } else {
                await sock.sendMessage(remoteJid, { 
                  text: `💥 *PIÈGE !* (-35 HP) !\n🩸 *Vie :* ${jeuEnCours.hp} HP.\n\n${etapeActuelle.desc}${mentionSuivant}`,
                  mentions: mentionsList
                }, { quoted: msg });
              }
            } else if (suite === "soin") {
              jeuEnCours.hp = Math.min(100, jeuEnCours.hp + 30);
              await sock.sendMessage(remoteJid, { 
                text: `🧪 *SOIN !* +30 HP ! (Vie : ${jeuEnCours.hp} HP)\n👉 Tapez *@est* pour continuer.${mentionSuivant}`,
                mentions: mentionsList
              }, { quoted: msg });
            } else if (suite === "clef") {
              await sock.sendMessage(remoteJid, { 
                text: `🗝️ *CLÉ TROUVÉE !*\n👉 Tapez *@nord* pour progresser.${mentionSuivant}`,
                mentions: mentionsList
              }, { quoted: msg });
            } else if (suite === "combat") {
              if (Math.random() > 0.3) {
                jeuEnCours.etapeIndex += 1;
                await sock.sendMessage(remoteJid, { 
                  text: `⚔️ *VICTOIRE !*\n\n${donjon.etapes[jeuEnCours.etapeIndex].desc}${mentionSuivant}`,
                  mentions: mentionsList
                }, { quoted: msg });
              } else {
                jeuEnCours.hp -= 40;
                if (jeuEnCours.hp <= 0) {
                  await terminerManche(remoteJid, sock, `💀 *ÉQUIPE ÉLIMINÉE !* Vaincue en combat !`);
                } else {
                  await sock.sendMessage(remoteJid, { 
                    text: `🩸 *BLESSURE !* (-40 HP) ! (Vie : ${jeuEnCours.hp} HP)\n👉 *@attaquer* ou *@fuir* !${mentionSuivant}`,
                    mentions: mentionsList
                  }, { quoted: msg });
                }
              }
            } else if (typeof suite === 'number') {
              jeuEnCours.etapeIndex = suite - 1;
              const nouvEtape = donjon.etapes[jeuEnCours.etapeIndex];
              if (nouvEtape.options === "victoire") {
                await terminerManche(remoteJid, sock, `🏆 *VICTOIRE !* Labyrinthe terminé avec **${jeuEnCours.hp} HP** ! 🎉`);
              } else {
                await sock.sendMessage(remoteJid, { 
                  text: `📍 *PROGRESSION :*\n\n${nouvEtape.desc}${mentionSuivant}`,
                  mentions: mentionsList
                }, { quoted: msg });
              }
            }
          }
          return;
        }

        // 🎲 2. JEU DU DÉ BATTLE
        if (jeuEnCours.type === 'DE_BATTLE') {
          const joueurActuel = jeuEnCours.joueurs[jeuEnCours.tourIndex];

          if (joueurActuel.jid !== senderJid) {
            await sock.sendMessage(remoteJid, { 
              text: `⚠️ Ce n'est pas ton tour ! C'est à *@${joueurActuel.jid.split('@')[0]}* !`,
              mentions: [joueurActuel.jid]
            }, { quoted: msg });
            return;
          }

          if (action === 'lancer' || action === 'de') {
            const deResultat = Math.floor(Math.random() * 6) + 1;
            
            if (deResultat === jeuEnCours.objectif) {
              jeuEnCours.qualifies.push(joueurActuel);
              await sock.sendMessage(remoteJid, { 
                text: `🎲 *@${senderJid.split('@')[0]}* a tiré un **[ ${deResultat} ]** !\n🎉 **QUALIFIÉ** !`,
                mentions: [senderJid]
              }, { quoted: msg });
            } else {
              await sock.sendMessage(remoteJid, { 
                text: `🎲 *@${senderJid.split('@')[0]}* a tiré un **[ ${deResultat} ]** ! (Objectif : ${jeuEnCours.objectif}) - Raté.`,
                mentions: [senderJid]
              }, { quoted: msg });
            }

            let nonQualifies = jeuEnCours.joueurs.filter(j => !jeuEnCours.qualifies.includes(j));

            if (nonQualifies.length === 1 && jeuEnCours.joueurs.length > 1) {
              const elimine = nonQualifies[0];
              jeuEnCours.joueurs = jeuEnCours.joueurs.filter(j => j.jid !== elimine.jid);
              jeuEnCours.qualifies = [];

              if (jeuEnCours.joueurs.length === 1) {
                const gagnant = jeuEnCours.joueurs[0];
                await terminerManche(remoteJid, sock, `💀 *@${elimine.jid.split('@')[0]}* est **ÉLIMINÉ** !\n\n🏆 *GRAND GAGNANT DU DÉ : @${gagnant.jid.split('@')[0]} !* 🎉`);
                return;
              }

              jeuEnCours.manche += 1;
              jeuEnCours.objectif = OBJECTIFS_DE[Math.floor(Math.random() * OBJECTIFS_DE.length)];
              jeuEnCours.tourIndex = 0;

              let msgElim = `💀 *@${elimine.jid.split('@')[0]}* est **ÉLIMINÉ** !\n\n🔄 *MANCHE ${jeuEnCours.manche} !*\n🎯 *Objectif :* Faire un **[ ${jeuEnCours.objectif} ]** !\n👉 À *@${jeuEnCours.joueurs[0].jid.split('@')[0]}* de lancer (*@lancer*) !`;
              await sock.sendMessage(remoteJid, { text: msgElim, mentions: jeuEnCours.joueurs.map(j => j.jid) });
              return;
            }

            let chercheProchain = true;
            while (chercheProchain) {
              jeuEnCours.tourIndex = (jeuEnCours.tourIndex + 1) % jeuEnCours.joueurs.length;
              const pro = jeuEnCours.joueurs[jeuEnCours.tourIndex];
              if (!jeuEnCours.qualifies.includes(pro)) chercheProchain = false;
            }

            const prochainJoueur = jeuEnCours.joueurs[jeuEnCours.tourIndex];
            await sock.sendMessage(remoteJid, { 
              text: `🎯 Tour de : *@${prochainJoueur.jid.split('@')[0]}*\n👉 Tapez *@lancer* !`,
              mentions: [prochainJoueur.jid]
            });
          }
          return;
        }

        // 🦑 3. SQUID GAME
        if (jeuEnCours.type === 'SQUID_GAME') {
          const joueurActuel = jeuEnCours.joueurs[jeuEnCours.tourIndex];

          if (joueurActuel.jid !== senderJid) {
            await sock.sendMessage(remoteJid, { 
              text: `⚠️ Ce n'est pas ton tour ! C'est à *@${joueurActuel.jid.split('@')[0]}* !`,
              mentions: [senderJid, joueurActuel.jid]
            }, { quoted: msg });
            return;
          }

          if (jeuEnCours.enAttenteReponse) {
            if (action === jeuEnCours.motAttendu) {
              clearTimeout(jeuEnCours.timerSquid);
              jeuEnCours.enAttenteReponse = false;

              await sock.sendMessage(remoteJid, { 
                text: `✅ *SAUVÉ !* *@${senderJid.split('@')[0]}* a franchi la ligne ! 🎉`,
                mentions: [senderJid]
              }, { quoted: msg });

              jeuEnCours.tourIndex = (jeuEnCours.tourIndex + 1) % jeuEnCours.joueurs.length;
              setTimeout(() => lancerTourSquidGame(sock, remoteJid), 2500);
            } else {
              clearTimeout(jeuEnCours.timerSquid);
              jeuEnCours.enAttenteReponse = false;
              
              const cinematique = CINEMATIQUES_ELIMINATION[Math.floor(Math.random() * CINEMATIQUES_ELIMINATION.length)];
              let msgElim = `💥 *ERREUR !\n\n${cinematique}\n\n💀 *@${joueurActuel.jid.split('@')[0]}* est **ÉLIMINÉ** !`;

              jeuEnCours.joueurs.splice(jeuEnCours.tourIndex, 1);
              if (jeuEnCours.joueurs.length > 0) {
                jeuEnCours.tourIndex = jeuEnCours.tourIndex % jeuEnCours.joueurs.length;
              }

              await sock.sendMessage(remoteJid, { text: msgElim, mentions: [joueurActuel.jid] });
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
              await terminerManche(remoteJid, sock, `💥 *BOOOOOOOM ! PAN !* 💥\n💀 *@${senderJid.split('@')[0]}* s'est fait éliminer au tir N°${jeuEnCours.essais} !`);
            } else {
              jeuEnCours.chambreActuelle += 1;
              await sock.sendMessage(remoteJid, { 
                text: `📄 *CLIC !* Balle à blanc (${jeuEnCours.essais}/6) !\n🎉 @${senderJid.split('@')[0]} survit !\n👉 Suivant : *@tirer* ou *@tourner* !` 
              }, { quoted: msg });
            }
          } else if (action === 'tourner') {
            jeuEnCours.chambreActuelle = Math.floor(Math.random() * 6) + 1;
            await sock.sendMessage(remoteJid, { text: `🔄 Barillet tourné ! Envoyez *@tirer* !` }, { quoted: msg });
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
              await sock.sendMessage(remoteJid, { text: `📈 Plus grand que ${num} !` }, { quoted: msg });
            } else {
              await sock.sendMessage(remoteJid, { text: `📉 Plus petit que ${num} !` }, { quoted: msg });
            }
          }
          return;
        }

        // 🎯 6. CHASSE À L'EMOJI
        if (jeuEnCours.type === 'CHASSE_EMOJI') {
          if (action === jeuEnCours.cible.toLowerCase()) {
            await terminerManche(remoteJid, sock, `🏆 *BRAVO @${senderJid.split('@')[0]} !* Emoji trouvé : **${jeuEnCours.cible}** ! 🎉`);
          }
          return;
        }
      }

      // ----------------------------------------------------
      // ✍️ INSCRIPTION SALONS (.inscrire)
      // ----------------------------------------------------
      if (lowerText.startsWith('.inscrire') || lowerText.startsWith('.rejoindre')) {
        if (!jeuEnCours || jeuEnCours.statut !== 'INSCRIPTION') {
          await sock.sendMessage(remoteJid, { text: "⚠️ Aucun salon ouvert." }, { quoted: msg });
          return;
        }

        const args = cleanText.split(" ");
        const pseudo = args[1];

        if (!pseudo || pseudo.length < 2 || pseudo.length > 8) {
          await sock.sendMessage(remoteJid, { text: "⚠️ *Précisez un surnom de 2 à 8 lettres !* Ex: `.inscrire Titan`" }, { quoted: msg });
          return;
        }

        const existe = jeuEnCours.joueurs.find(j => j.jid === senderJid);
        if (!existe) {
          jeuEnCours.joueurs.push({ jid: senderJid, pseudo: pseudo.toUpperCase() });
          demarrerTimerInactivite(sock, remoteJid);

          let listePseudos = jeuEnCours.joueurs.map((j, i) => `${i + 1}. *${j.pseudo}* (@${j.jid.split('@')[0]})`).join("\n");
          let infoMessage = `✅ *${pseudo.toUpperCase()}* a rejoint !\n\n👥 *Inscrits (${jeuEnCours.joueurs.length}) :*\n${listePseudos}\n\n👉 Tapez **.jouer** pour lancer !`;
          
          await sock.sendMessage(remoteJid, { text: infoMessage, mentions: jeuEnCours.joueurs.map(j => j.jid) }, { quoted: msg });
        } else {
          await sock.sendMessage(remoteJid, { text: `⚠️ Déjà inscrit sous *${existe.pseudo}* !` }, { quoted: msg });
        }
        return;
      }

      // ----------------------------------------------------
      // 🔄 CONTRÔLE (.jouer / .stop)
      // ----------------------------------------------------
      if (lowerText === '.jouer') {
        if (!jeuEnCours) {
          await sock.sendMessage(remoteJid, { text: "⚠️ Aucun salon ouvert." }, { quoted: msg });
          return;
        }

        if (jeuEnCours.statut === 'INSCRIPTION') {
          if (jeuEnCours.type === 'LABYRINTHE_DUEL' && jeuEnCours.joueurs.length < 2) {
            await sock.sendMessage(remoteJid, { text: "⚠️ Au moins 2 joueurs requis !" }, { quoted: msg });
            return;
          }

          jeuEnCours.statut = 'EN_COURS';
          jeuEnCours.manche += 1;
          demarrerTimerInactivite(sock, remoteJid);

          if (jeuEnCours.type.startsWith('LABYRINTHE')) {
            const donjon = DONJONS_LABYRINTHE[Math.floor(Math.random() * DONJONS_LABYRINTHE.length)];
            jeuEnCours.donjon = donjon;
            jeuEnCours.etapeIndex = 0;
            jeuEnCours.hp = 100;
            jeuEnCours.joueurActif = choisirJoueurAleatoire(jeuEnCours.joueurs);

            await sock.sendMessage(remoteJid, { 
              text: `🌀 *LABYRINTHE COMMENCÉ !*\n📍 Donjon : **${donjon.nom}**\n🎯 *Premier tour :* @${jeuEnCours.joueurActif.jid.split('@')[0]} (${jeuEnCours.joueurActif.pseudo})\n\n${donjon.etapes[0].desc}`,
              mentions: [jeuEnCours.joueurActif.jid]
            });
            return;
          }

          if (jeuEnCours.type === 'DE_BATTLE') {
            jeuEnCours.objectif = OBJECTIFS_DE[Math.floor(Math.random() * OBJECTIFS_DE.length)];
            jeuEnCours.tourIndex = 0;
            jeuEnCours.qualifies = [];

            await sock.sendMessage(remoteJid, { 
              text: `🎲 *DÉ BATTLE ROYALE !*\n🎯 *Objectif :* Faire un **[ ${jeuEnCours.objectif} ]** !\n👉 Tour de : *@${jeuEnCours.joueurs[0].jid.split('@')[0]}*\n👉 Tapez *@lancer* !`,
              mentions: jeuEnCours.joueurs.map(j => j.jid)
            });
            return;
          }

          if (jeuEnCours.type === 'SQUID_GAME') {
            jeuEnCours.tourIndex = 0;
            await sock.sendMessage(remoteJid, { text: `🦑 *SQUID GAME DÉMARRÉ !*` });
            setTimeout(() => lancerTourSquidGame(sock, remoteJid), 2500);
            return;
          }
        }

        if (jeuEnCours.statut === 'ATTENTE_RELANCE') {
          jeuEnCours.statut = 'INSCRIPTION';
          jeuEnCours.joueurs = [];
          jeuEnCours.qualifies = [];
          await sock.sendMessage(remoteJid, { text: `🔄 *SALON RELANCÉ !* Inscrivez-vous avec **.inscrire <surnom>** puis tapez **.jouer** !` });
        }
        return;
      }

      if (lowerText === '.stop') {
        if (jeuEnCours) {
          reinitialiserJeu(remoteJid);
          await sock.sendMessage(remoteJid, { text: "🛑 *Salon fermé et mémoire RAM libérée !*" }, { quoted: msg });
        } else {
          await sock.sendMessage(remoteJid, { text: "⚠️ Aucun jeu en cours." }, { quoted: msg });
        }
        return;
      }

      // ----------------------------------------------------
      // 📜 MENU PRINCIPAL (.menu)
      // ----------------------------------------------------
      if (lowerText === '.menu' || lowerText === 'menu') {
        const menuText = `
🤖 *TITAN BOT - JEUX & OUTILS SYSTEME* 🤖

👁️ *OUTILS UTILS*
├── 🔓 *.vv* (ou *.vueunique*) → Débloque et renvoie un message Vue Unique
└── 📸 *.pp* [@mention/réponse] → Récupère la photo de profil WhatsApp

🎮 *SESSIONS DE JEUX*
├── 🏛️ *.labyrinthe* [solo/equipe/duel] → RPG Donjon
├── 🎲 *.de* → Battle Royale de Dé
├── 🦑 *.squidgame* → Feu Rouge / Feu Vert
├── 💀 *.roulette* → Roulette Russe (1/6)
├── 🔢 *.chiffremystere* → Jeu du nombre mystère
└── 🎯 *.chasse-emoji* → Rapidité Emoji

⚙️ *GESTION SALONS*
├── ✍️ *.inscrire <surnom>* → S'inscrire au salon
├── 🚀 *.jouer* → Lancer la partie / Relancer
└── 🛑 *.stop* → Fermer le salon & nettoyer la RAM`;

        await sock.sendMessage(remoteJid, { text: menuText }, { quoted: msg });
        return;
      }

      // ----------------------------------------------------
      // 🎮 COMMANDES DE JEUX (1, 2, 3, 4, 5, 6)
      // ----------------------------------------------------
      if (lowerText.startsWith('.labyrinthe')) {
        const mode = cleanText.split(" ")[1]?.toLowerCase();
        if (!mode) {
          await sock.sendMessage(remoteJid, { text: "🌀 *LABYRINTHE :*\n1️⃣ **.labyrinthe solo**\n2️⃣ **.labyrinthe equipe**\n3️⃣ **.labyrinthe duel**" }, { quoted: msg });
          return;
        }

        reinitialiserJeu(remoteJid);
        if (mode === 'solo') {
          const donjon = DONJONS_LABYRINTHE[Math.floor(Math.random() * DONJONS_LABYRINTHE.length)];
          partiesEnCours[remoteJid] = { type: 'LABYRINTHE_SOLO', statut: 'EN_COURS', manche: 1, donjon: donjon, etapeIndex: 0, hp: 100, joueurActif: { jid: senderJid, pseudo: "SOLO" } };
          demarrerTimerInactivite(sock, remoteJid);
          await sock.sendMessage(remoteJid, { text: `👤 *MODE SOLO*\n📍 Donjon : **${donjon.nom}**\n\n${donjon.etapes[0].desc}` }, { quoted: msg });
        } else {
          partiesEnCours[remoteJid] = { type: mode === 'duel' ? 'LABYRINTHE_DUEL' : 'LABYRINTHE_EQUIPE', statut: 'INSCRIPTION', manche: 0, joueurs: [] };
          demarrerTimerInactivite(sock, remoteJid);
          await sock.sendMessage(remoteJid, { text: `👥 *SALON LABYRINTHE (${mode.toUpperCase()}) OUVERT !*\n👉 **.inscrire <surnom>** puis **.jouer** !` }, { quoted: msg });
        }
        return;
      }

      if (lowerText.startsWith('.de')) {
        reinitialiserJeu(remoteJid);
        partiesEnCours[remoteJid] = { type: 'DE_BATTLE', statut: 'INSCRIPTION', manche: 0, joueurs: [], qualifies: [], tourIndex: 0 };
        demarrerTimerInactivite(sock, remoteJid);
        await sock.sendMessage(remoteJid, { text: `🎲 *SALON DÉ BATTLE ROYALE OUVERT !*\n👉 **.inscrire <surnom>** puis **.jouer** !` }, { quoted: msg });
        return;
      }

      if (lowerText === '.squidgame' || lowerText === '.feurouge') {
        reinitialiserJeu(remoteJid);
        partiesEnCours[remoteJid] = { type: 'SQUID_GAME', statut: 'INSCRIPTION', manche: 0, joueurs: [], tourIndex: 0, enAttenteReponse: false };
        demarrerTimerInactivite(sock, remoteJid);
        await sock.sendMessage(remoteJid, { text: `🦑 *SALON SQUID GAME OUVERT !*\n👉 **.inscrire <surnom>** puis **.jouer** !` }, { quoted: msg });
        return;
      }

      if (lowerText === '.roulette') {
        reinitialiserJeu(remoteJid);
        partiesEnCours[remoteJid] = { type: 'ROULETTE_ULTIMATE', statut: 'EN_COURS', manche: 1, chambreBalle: Math.floor(Math.random() * 6) + 1, chambreActuelle: 1, essais: 0 };
        demarrerTimerInactivite(sock, remoteJid);
        await sock.sendMessage(remoteJid, { text: `💀 *ROULETTE RUSSE CHARGÉE !*\n👉 Tente ta chance avec *@tirer* ou *@tourner* !` }, { quoted: msg });
        return;
      }

      if (lowerText === '.chiffremystere') {
        reinitialiserJeu(remoteJid);
        const secret = Math.floor(Math.random() * 100) + 1;
        partiesEnCours[remoteJid] = { type: 'CHIFFRE_MYSTERE', statut: 'EN_COURS', solution: secret, manche: 1 };
        demarrerTimerInactivite(sock, remoteJid);
        await sock.sendMessage(remoteJid, { text: `🔢 *CHIFFRE MYSTÈRE !* Devine le nombre entre 1 et 100 avec **@** (ex: *@50*) !` }, { quoted: msg });
        return;
      }

      if (lowerText === '.chasse-emoji') {
        reinitialiserJeu(remoteJid);
        const emoji = EMOJIS_DICO[Math.floor(Math.random() * EMOJIS_DICO.length)];
        partiesEnCours[remoteJid] = { type: 'CHASSE_EMOJI', statut: 'EN_COURS', cible: emoji, manche: 1 };
        demarrerTimerInactivite(sock, remoteJid);
        await sock.sendMessage(remoteJid, { text: `🎯 *CHASSE À L'EMOJI !* Renvoyez vite **@${emoji}** !` }, { quoted: msg });
        return;
      }

    } catch (err) {
      console.error("Erreur globale :", err);
    }
  });
}

startBot();
