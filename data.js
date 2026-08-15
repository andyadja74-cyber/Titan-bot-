// ==========================================
// 📚 BANQUE DE DONNÉES DU BOT TITAN
// ==========================================

const DICTIONNAIRE = {
  "developpeur": {
    def: "Personne qui conçoit et écrit des programmes informatiques.",
    syn: ["programmateur", "codeur", "ingénieur logiciel"]
  },
  "robot": {
    def: "Machine automatique capable de réaliser des tâches complexes.",
    syn: ["automate", "bot", "cyborg"]
  },
  "intelligence": {
    def: "Faculté de comprendre, d'apprendre et de s'adapter.",
    syn: ["intellect", "raison", "sagacité"]
  },
  "labyrinthe": {
    def: "Réseau complexe de chemins dont il est difficile de sortir.",
    syn: ["dédale", "médina", "méandre"]
  },
  "victoire": {
    def: "Succès remporté dans une compétition, un jeu ou une guerre.",
    syn: ["triomphe", "succès", "conquête"]
  }
};

const COMMENTAIRES_LOVE = {
  parfait: [
    "🔥 Âmes sœurs détectées ! L'amour fou au rendez-vous.",
    "💍 Préparez le mariage, c'est une combinaison parfaite !"
  ],
  moyen: [
    "⚡ Il y a de l'étincelle, mais attention aux petites disputes !",
    "🤝 Une belle amitié qui pourrait devenir une belle histoire avec du temps."
  ],
  faible: [
    "🧊 C'est aussi froid que le pôle Nord... Bon courage !",
    "⚠️ Compatibilité risquée. Mieux vaut rester simples amis."
  ]
};

const CITATIONS = [
  { c: "Le succès, c'est d'aller d'échec en échec sans perdre son enthousiasme.", a: "Winston Churchill" },
  { c: "La vie est un mystère qu'il faut vivre, non un problème à résoudre.", a: "Gabriel Marcel" },
  { c: "L'imagination est plus importante que le savoir.", a: "Albert Einstein" },
  { c: "On ne voit bien qu'avec le cœur. L'essentiel est invisible pour les yeux.", a: "Antoine de Saint-Exupéry" },
  { c: "Soyez le changement que vous voulez voir dans le monde.", a: "Mahatma Gandhi" },
  { c: "Le plus grand risque est de ne prendre aucun risque.", a: "Mark Zuckerberg" },
  { c: "La connaissance s'acquiert par l'expérience, tout le reste n'est que de l'information.", a: "Albert Einstein" },
  { c: "Rien ne se perd, rien ne se crée, tout se transforme.", a: "Antoine Lavoisier" },
  { c: "Ce qui ne me tue pas me rend plus fort.", a: "Friedrich Nietzsche" },
  { c: "Croyez en vos rêves et ils se réaliseront peut-être. Croyez en vous et ils se réaliseront sûrement.", a: "Martin Luther King" }
];

for (let i = 11; i <= 100; i++) {
  CITATIONS.push({
    c: `Pensée inspirante et citation motivante numéro ${i} pour nourrir votre esprit au quotidien.`,
    a: `Auteur Inspirant N°${i}`
  });
}

module.exports = {
  DICTIONNAIRE,
  COMMENTAIRES_LOVE,
  CITATIONS
};
