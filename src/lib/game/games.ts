import { CHARADES_TIME_OPTIONS } from "./charades";
import { FIVE_TIME_OPTIONS } from "./five-engine";
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
  /** The host can choose how long a round/turn lasts. */
  time?: { label: string; options: number[]; default: number };
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
    title: "٥ أعمال",
    sub: "اكتب ٥ أعمال للممثل قبل ما الوقت يخلص",
    rules: "كل جولة: ممثل عشوائي، وكله بيكتب في نفس الوقت. انت اللي بتحدد الوقت. ٢٠ نقطة لكل عنوان صح، +٢٠ لو كملت ٥، + بونص السرعة.",
    roundOptions: [5, 10, 15],
    roundsLabel: "عدد الجولات",
    uses: {},
    time: { label: "وقت كل جولة", options: FIVE_TIME_OPTIONS, default: 30 },
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
    title: "أفلام",
    sub: "فريقين: مثّل الفيلم والفريق التاني يخمّن",
    rules: "اللاعبين بيختاروا فريق. كل فريق بالدور بياخد اسم فيلم أو مسلسل ويختار واحد منهم يمثّله من غير كلام، والفريق التاني يكتب تخمينه في التطبيق. اسم العمل بيظهر على موبايل اللي بيمثّل بس.",
    roundOptions: [1, 2, 3, 4, 5],
    roundsLabel: "عدد الجولات (في كل جولة كل فريق بيمثّل مرة)",
    uses: {},
    time: { label: "وقت التمثيل", options: CHARADES_TIME_OPTIONS, default: 60 },
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
