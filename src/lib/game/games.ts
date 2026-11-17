import type { GameKind } from "./types";

/** The family decides which engine and which screens run a game. */
export type Family = "staged" | "five" | "quiz" | "charades" | "chain";

export interface GameMeta {
  id: GameKind;
  family: Family;
  icon: string;
  title: string;
  /** One line on the picker card. */
  sub: string;
  /** Longer rules for the settings panel. */
  rules: string;
  roundOptions: number[];
  roundsLabel: string;
  /** Settings this game uses besides the number of rounds. */
  uses: { pool?: boolean; difficulty?: boolean; autoReveal?: boolean };
}

export const GAMES: GameMeta[] = [
  {
    id: "tetrat",
    family: "staged",
    icon: "🎬",
    title: "أفيش",
    sub: "اعرف الفيلم من الممثلين",
    rules: "٣ مراحل: الأدوار المساعدة ثم دور أكبر ثم الأبطال. كل ما تعرف بدري، نقطك أكتر.",
    roundOptions: [5, 10, 15],
    roundsLabel: "عدد الجولات",
    uses: { pool: true, difficulty: true, autoReveal: true },
  },
  {
    id: "five",
    family: "five",
    icon: "⏱️",
    title: "٥ في ٣٠",
    sub: "اكتب ٥ أعمال للممثل في ٣٠ ثانية",
    rules: "كل جولة: ممثل عشوائي، وكله بيكتب في نفس الوقت. ٢٠ نقطة لكل عنوان صح، +٢٠ لو كملت ٥، + بونص السرعة.",
    roundOptions: [5, 10, 15],
    roundsLabel: "عدد الجولات",
    uses: {},
  },
  {
    id: "link",
    family: "staged",
    icon: "🔗",
    title: "الرابط المشترك",
    sub: "مين الممثل اللي في كل الأعمال دي؟",
    rules: "بنعرض أعمال، واكتب الممثل اللي شارك في كلها. كل ما بنزود عمل، النقط بتقل.",
    roundOptions: [5, 10, 15],
    roundsLabel: "عدد الجولات",
    uses: { autoReveal: true },
  },
  {
    id: "quote",
    family: "staged",
    icon: "💬",
    title: "الإفيه",
    sub: "الجملة دي من أنهي فيلم؟",
    rules: "بنعرض جملة مشهورة، واكتب اسم العمل. بعد شوية بنديك السنة والنوع، وبعدين اللي قالها.",
    roundOptions: [5, 10, 15],
    roundsLabel: "عدد الجولات",
    uses: { autoReveal: true },
  },
  {
    id: "beforeafter",
    family: "quiz",
    icon: "📅",
    title: "قبل ولا بعد؟",
    sub: "أنهي فيلم اتعمل الأول؟",
    rules: "عملين قدامك: دوس على اللي نزل الأول. ١٠٠ نقطة للصح + لحد ٥٠ للسرعة.",
    roundOptions: [5, 10, 15],
    roundsLabel: "عدد الأسئلة",
    uses: { difficulty: true },
  },
  {
    id: "odd",
    family: "quiz",
    icon: "🕵️",
    title: "مين مش منهم؟",
    sub: "٣ ممثلين في نفس العمل، ومين الدخيل؟",
    rules: "٤ ممثلين: ٣ منهم اشتغلوا في نفس العمل. دوس على الدخيل. ١٠٠ نقطة للصح + لحد ٥٠ للسرعة.",
    roundOptions: [5, 10, 15],
    roundsLabel: "عدد الأسئلة",
    uses: {},
  },
  {
    id: "charades",
    family: "charades",
    icon: "🎭",
    title: "بانتومايم",
    sub: "مثّل الفيلم من غير كلام",
    rules: "كل لاعب بيمثّل عمل في ٦٠ ثانية من غير ما يتكلم، والباقي يكتبوا تخمينهم. اسم العمل بيظهر على موبايل الممثل بس.",
    roundOptions: [1, 2, 3],
    roundsLabel: "عدد الدورات (كل لاعب بيمثّل مرة في الدورة)",
    uses: {},
  },
  {
    id: "chain",
    family: "chain",
    icon: "⛓️",
    title: "سلسلة",
    sub: "ممثل ← عمل ← ممثل… لحد ما حد يقع",
    rules: "بنبدأ بعمل. كل واحد في دوره (١٥ ثانية) يقول ممثل من العمل، والتاني يقول عمل تاني للممثل ده، وهكذا. ٣ قلوب لكل لاعب. آخر واحد يفضل يكسب.",
    roundOptions: [],
    roundsLabel: "",
    uses: {},
  },
];

export const gameMeta = (g?: GameKind): GameMeta => GAMES.find((x) => x.id === (g ?? "tetrat")) ?? GAMES[0];
export const familyOf = (g?: GameKind): Family => gameMeta(g).family;
