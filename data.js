// 📦 BANQUES DE DONNÉES ET ÉTATS DU BOT TITAN

module.exports = {
  // 💘 COMPATIBILITÉ & AMOUR
  COMMENTAIRES_LOVE: {
    parfait: ["Une alchimie parfaite ! 💖", "C'est l'amour fou ! 😍", "Faits l'un pour l'autre ! ✨"],
    moyen: ["Il y a un potentiel ! 🙂", "Ça se tente ! 😉", "À travailler avec le temps ! ⏳"],
    faible: ["L'amitié c'est bien aussi... 😅", "Aïe, zone de danger ! 💔", "Compatibilité minimale... 😬"]
  },
  MOTS_AMOUR_PRIVE: ["je t'aime", "je t'aime tellement"],
  REPONSE_AMOUR_MAMAN: "Moi aussi je t'aime maman 🤖☺️",

  // 🐾 ANIMEAUX DE COMPAGNIE
  LISTE_ANIMAUX: [
    { nom: "Chien", type: "canin", nourriture: "croquettes" },
    { nom: "Chat", type: "félin", nourriture: "poisson" },
    { nom: "Dragon", type: "mythique", nourriture: "viande grillée" },
    { nom: "Panda", type: "mammifère", nourriture: "bambou" }
  ],

  // 🔴 SQUID GAME
  MOTS_SQUID: ["BOUGER", "BBBBBB", "YELHSA", "ANDLEY", "BOTTI", "AMONGUSS", "AVANCER", "EXTRAANDY", "SOLEIL", "FEU"],

  // 🕵️‍♂️ DÉTECTIVE
  DONNEES_DETECTIVE_BOOSTE: {
    suspects: ["Lord Blackwood", "Lady Clara", "Le Chef Cook", "Le Valet James"],
    lieux: ["Le Salon", "La Bibliothèque", "La Cuisine", "Le Jardin"],
    armes: ["Poignard", "Poison", "Corde", "Revolver"],
    temoignagesFaux: [
      "Un serviteur affirme avoir vu de la lumière dans le jardin.",
      "Une ombre a été aperçue près de la cuisine.",
      "Un bruit de verre brisé a retenti près du salon."
    ]
  },

  // 🧠 CERVEAU / MOX (BOOSTÉ)
  DONNEES_CERVEAU: [
    "🤪 Niveau de folie",
    "⚡ Vitesse de réflexion",
    "💡 Niveau de génie",
    "🎭 Taux de sociabilité",
    "🧠 Capacité de concentration"
  ],
  COMMENTAIRES_CERVEAU: [
    "Attention, ce cerveau tourne sous Windows 95 avec 2 Mo de RAM ! 💻",
    "Niveau de folie critique... Éloignez immédiatement cette personne du groupe ! 🤪",
    "Un génie incompris... surtout par lui-même ! 🤯",
    "Surchauffe neuronale imminente ! Laissez refroidir 15 minutes. 🔥",
    "Analyse terminée : 99% de pensées pour manger, 1% de réflexion. 🍕",
    "Ce cerveau est tellement rapide qu'il dépasse sa propre logique ! ⚡"
  ],

  // 🤫 SECRET D'ANDY
  MESSAGE_SECRET_ANDY: `Ashley tu ne sais pas à quel point je suis content 🙂 que tu sois là 😌🤩
T'a mm réussi à déverrouiller le mot de passe🔐 
En vrai c'était facile il a juste demander ton identité🪪 
Bref je vais aller droit au but😯💨 Andy que tu connais là mais purée il a changé de ouf😵‍💫😢 c'est un OBSÉDÉ 
Je t'assure il est gravé obsédé🧟 en mode obsession niveau max ça veut peter💥 même,mais par qui🧍🏼‍♀️ est il obsédé ? 🧐
Humm... Ashley si tu es entrain de lire ce message c'est pas par hasard 🎲
Enfaite ce message t'étais déjà destinée🔮 en vrai Andy il est obsédé par toi oui toi Ashley 🫵🏼 orhh arrête de regarder à gauche ou à droite je parle bien de toi 🫵🏼 Humm... Il est obsédé par toi tu hantes ses pensées de ouf 😌💭👸🏼👸🏼 et même qu'il est amoureux de toi 😍 il pense que t'es ça reine 👸🏼 son honey 😍 sa copine 👥❤️
Bon c'est ce que je sais ohh faut pas lui dire que c'est moi je t'ai montré hyn 
Att 2 secondes imagine tu lis ça et toi mm tu le savais déjà ou b lui mm il t'avait déjà dit ça,ça allait être b sur moi hyn 😂 
Heureusement que tu sais pas hyn 😂 enfin je pense 🤔
Pour vue qu'elle ne le sache pas ohh 😬`,

  // 🚪 LABYRINTHE
  CHEMINS_LABYRINTHE: [
    ["gauche", "tout droit", "droite", "gauche", "tout droit", "droite", "gauche", "tout droit", "droite", "tout droit"],
    ["droite", "gauche", "tout droit", "droite", "gauche", "tout droit", "droite", "gauche", "tout droit", "gauche"]
  ],
  SUBS_LABYRINTHE: [
    "Vous marchez à tCover dans l'obscurité...",
    "Un bruit étrange résonne dans le couloir...",
    "La température baisse soudainement...",
    "Tu vas où mm 🤣"
  ],

  // 💾 MÉMOIRES ET ÉTATS TEMPORELS DU BOT
  partiesEnCours: {},
  timersInactivite: {},
  vueUniqueCache: {},
  animauxJoueurs: {},
  mesNotes: {},
  sessionsMotDePasse: {},
  profilsJoueurs: {},
  membresSalues: new Set(),
  sessionsSecretAndy: {}
};
