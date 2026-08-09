// ==========================================
// 🌐 MINI SERVEUR WEB (OBLIGATOIRE POUR RENDER)
// ==========================================
const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("🤖 BOT TITAN EST ACTIF ET EN LIGNE !");
});

app.listen(PORT, () => {
  console.log(`🌐 Serveur Web en écoute sur le port ${PORT}`);
});

// ==========================================
// 📦 IMPORTS & DÉPENDANCES
// ==========================================
const readline = require("readline");
const base = require("./base");
const { exec } = require("child_process");
const os = require("os");
const googleTTS = require("google-tts-api");
const axios = require("axios");
const { dictionnaireAttaquesManga } = require("./manga");

const {
  makeWASocket, useMultiFileAuthState, DisconnectReason, delay, Boom, pino,
  downloadContentFromMessage, fs, path, ffmpeg, NUMERO_BOT,
  tempsDerniereActivite, etapeRoyaume, etapeSecret, espionPartie, sniperEnCours,
  devineEnCours, chaineEnCours, motsClesPositifsReine, reponsesBotPourReine,
  texteRevelationSecret, phrasesErreurNomSecret, phrasesExpulsionRoyaume,
  dictionnaireEspion, dictionnaireIntrus, amorcesHistoires, reponses8Ball,
  partieIntrus, citationsManga, emojisSimple, emojisComplexe, partieEmoji,
  partieBaccalaureat, mariagesVirtuels, karmaMembres, inventairesMembres,
  partieLoupGarou, dictionnaireBaccalaureat, partieRouletteRusse,
  partieChasseAuTresor, partieDevineAnimal, partieLoupGarouTexte,
  partieCadavreExquis, partiePatateChaude, metiersMembres,
  dictionnaireChasseTresor, dictionnaireAnimaux, partieNiOuiNiNon,
  partieDactylo, partieComboEmoji, phrasesDactylo, combosListe,
  obtenirCommentaireLove
} = base;

function nettoyerMemoireRAM() {
  if (global.gc) global.gc();
}
setInterval(nettoyerMemoireRAM, 10 * 60 * 1000);

function normaliserTexte(texte) {
  if (!texte) return "";
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

function calculerDelaiEnvoi(longueur) {
  if (longueur < 340) {
    return Math.round(3000 + (longueur / 339) * (8000 - 3000));
  } else if (longueur < 640) {
    return Math.round(8000 + ((longueur - 340) / 299) * (15000 - 8000));
  } else {
    return 20000;
  }
}

function extraireVueUnique(m) {
  if (!m || !m.message) return null;
  const msgType = Object.keys(m.message)[0];
  
  if (msgType === "viewOnceMessage" || msgType === "viewOnceMessageV2" || msgType === "viewOnceMessageV2Extension") {
    const innerMsg = m.message[msgType].message;
    const innerType = Object.keys(innerMsg)[0];
    return {
      type: innerType,
      content: innerMsg[innerType],
      messageComplet: innerMsg
    };
  }
  return null;
}

async function enregistrerPhotoProfil(sock, jid, dossier = "./profiles") {
  try {
    if (!fs.existsSync(dossier)) fs.mkdirSync(dossier, { recursive: true });
    const urlPP = await sock.profilePictureUrl(jid, "image").catch(() => null);
    if (!urlPP) return null;

    const response = await axios.get(urlPP, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);
    const nomFichier = `${jid.replace(/[^0-9]/g, "")}_pp.jpg`;
    const cheminComplet = path.join(dossier, nomFichier);

    fs.writeFileSync(cheminComplet, buffer);
    return cheminComplet;
  } catch (error) {
    return null;
  }
}

function maintenirComposing(sock, jid) {
  sock.sendPresenceUpdate("composing", jid).catch(() => {});
  const timer = setInterval(() => {
    sock.sendPresenceUpdate("composing", jid).catch(() => {});
  }, 3500);

  return () => {
    clearInterval(timer);
    sock.sendPresenceUpdate("paused", jid).catch(() => {});
  };
}

async function repondreAvecSimulation(sock, remoteJid, texte, msgQuoted = null, options = {}) {
  const stopComposing = maintenirComposing(sock, remoteJid);
  try {
    const delaiEcriture = calculerDelaiEnvoi(texte ? texte.length : 0);
    await delay(delaiEcriture);
    const payload = { text: texte, ...options };
    return msgQuoted ? await sock.sendMessage(remoteJid, payload, { quoted: msgQuoted }) : await sock.sendMessage(remoteJid, payload);
  } catch (err) {
    console.error("Erreur envoi message :", err);
  } finally {
    stopComposing();
    nettoyerMemoireRAM();
  }
}

async function envoyerVocalAvecSimulation(sock, remoteJid, texteVocal, msgQuoted = null, lang = 'fr') {
  const fileMp3Temp = path.join(os.tmpdir(), `tts_${Date.now()}.mp3`);
  const fileOpusTemp = path.join(os.tmpdir(), `tts_${Date.now()}.opus`);

  try {
    await sock.sendPresenceUpdate("recording", remoteJid);

    const urlAudio = googleTTS.getAudioUrl(texteVocal, {
      lang: lang,
      slow: false,
      host: 'https://translate.google.com',
      timeout: 10000,
    });

    const res = await axios.get(urlAudio, { responseType: 'arraybuffer' });
    fs.writeFileSync(fileMp3Temp, Buffer.from(res.data));

    await new Promise((resolve, reject) => {
      ffmpeg(fileMp3Temp)
        .audioFilters([
          'asetrate=24000*0.75',
          'atempo=1.333'
        ])
        .toFormat("ogg")
        .audioCodec("libopus")
        .audioChannels(1)
        .audioFrequency(16000)
        .on("end", resolve)
        .on("error", reject)
        .save(fileOpusTemp);
    });

    const dureeDelaiMs = calculerDelaiEnvoi(texteVocal ? texteVocal.length : 0);
    await delay(dureeDelaiMs);

    const optionsAudio = { 
      audio: fs.readFileSync(fileOpusTemp), 
      mimetype: 'audio/ogg; codecs=opus', 
      ptt: true 
    };

    const envoi = msgQuoted ? await sock.sendMessage(remoteJid, optionsAudio, { quoted: msgQuoted }) : await sock.sendMessage(remoteJid, optionsAudio);

    await sock.sendPresenceUpdate("paused", remoteJid);
    return envoi;
  } catch (err) {
    console.error("⚠️ Erreur lors de l'envoi du vocal :", err.message);
    await sock.sendPresenceUpdate("paused", remoteJid);
    return await repondreAvecSimulation(sock, remoteJid, `🔊 *[Voix Grave]* : "${texteVocal}"`, msgQuoted);
  } finally {
    if (fs.existsSync(fileMp3Temp)) fs.unlinkSync(fileMp3Temp);
    if (fs.existsSync(fileOpusTemp)) fs.unlinkSync(fileOpusTemp);
    nettoyerMemoireRAM();
  }
}

// --- CONNEXION WHATSAPP (COMPATIBLE RENDER & TERMUX) ---
async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");
  
  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" }),
    browser: ["Ubuntu", "Chrome", "20.0.04"]
  });

  // Si pas encore enregistré, on demande le code
  if (!sock.authState.creds.registered) {
    // 1. Essaye de lire le numéro depuis la variable RENDER 'PHONE_NUMBER'
    let phoneNumber = process.env.PHONE_NUMBER;

    // 2. Si pas de variable (ex: dans Termux), demande dans la console
    if (!phoneNumber) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const question = (text) => new Promise((res) => rl.question(text, res));
      phoneNumber = await question("📲 Entrez votre numéro WhatsApp (ex: 2250102030405) : ");
      rl.close();
    }

    if (phoneNumber) {
      phoneNumber = phoneNumber.replace(/[^0-9]/g, "");
      setTimeout(async () => {
        try {
          let code = await sock.requestPairingCode(phoneNumber);
          code = code?.match(/.{1,4}/g)?.join("-") || code;
          console.log("\n========================================");
          console.log(`🔑 VOTRE CODE PAIRING : ${code}`);
          console.log("========================================\n");
        } catch (err) {
          console.error("Erreur lors de la demande du Pairing Code :", err);
        }
      }, 3000);
    } else {
      console.log("⚠️ Aucun numéro fourni ! Ajoutez la variable PHONE_NUMBER sur Render.");
    }
  }

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "open") {
      console.log("✅ BOT TITAN PRÊT ET CONNECTÉ À WHATSAPP !");
    } else if (connection === "close") {
      const statusCode = (lastDisconnect?.error instanceof Boom) ? lastDisconnect.error.output.statusCode : null;
      if (statusCode !== DisconnectReason.loggedOut) connectToWhatsApp();
    }
  });

  // --- TRAITEMENT DES MESSAGES ---
  sock.ev.on("messages.upsert", async (m) => {
    try {
      if (m.type !== "notify") return;
      const msg = m.messages[0];
      if (!msg || !msg.message || msg.key.fromMe) return;

      const remoteJid = msg.key.remoteJid;
      const senderId = msg.key.participant || msg.key.remoteJid;

      const mContent = msg.message;
      const textReceived = 
        mContent.conversation || 
        mContent.extendedTextMessage?.text || 
        mContent.imageMessage?.caption || 
        mContent.videoMessage?.caption || "";
                           
      const cleanText = textReceived.trim();
      if (!cleanText) return;

      const lowerText = cleanText.toLowerCase();

      if (lowerText === "salut" || lowerText === ".menu" || lowerText === "menu") {
        await repondreAvecSimulation(sock, remoteJid, "🤖 *BOT TITAN ACTIF SUR RENDER !*", msg);
        return;
      }

      if (lowerText === ".ping") {
        const debut = Date.now();
        await repondreAvecSimulation(sock, remoteJid, `⚡ *PONG !* Latence : *${Date.now() - debut}ms*`, msg);
        return;
      }

    } catch (err) {
      console.error("Erreur traitement message :", err);
    }
  });
}

connectToWhatsApp();
