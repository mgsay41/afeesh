import type { Metadata } from "next";
import Link from "next/link";
import { TopBar } from "@/components/common";

export const metadata: Metadata = { title: "أفيش — عن اللعبة" };

type Rules = [icon: string, text: string][];

const COMMON: Rules = [
  ["🎮", "المضيف بيختار اللعبة الأول من ٨ ألعاب، وبعدين يبعت الكود أو الـ QR لصحابه. المضيف بيلعب معاهم."],
  ["⌨️", "لما تكتب اسم، مش لازم الإملاء يبقى مظبوط — لو قريب كفاية بتتحسب."],
  ["🧐", "لو إجابة صح بس مش في بياناتنا، المضيف ممكن يدوس «صح» وتتحسب."],
];

const GAMES: { title: string; rules: Rules }[] = [
  {
    title: "🎬 أفيش",
    rules: [
      ["🎟️", "كل جولة بتبدأ بـ ٣ ممثلين في أدوار مساعدة، بعدين ممثل بدور أكبر، وفي الآخر الأبطال. اكتب اسم الفيلم أو المسلسل."],
      ["🔥", "لو قربت هيقولك «قربت!». معاك ٣ محاولات غلط في كل جولة."],
      ["💡", "المضيف ممكن يكشف تلميحات: النوع، السنة، فيلم ولا مسلسل. كل تلميح بيخصم ١٠ نقط."],
      ["🏆", "١٠٠ نقطة في المرحلة الأولى، ٧٠ في التانية، ٤٠ في التالتة، و+٢٠ لأول واحد يعرف."],
    ],
  },
  {
    title: "⏱️ ٥ أعمال",
    rules: [
      ["⏱️", "كل جولة بيظهر ممثل عشوائي، وكله بيكتب في نفس الوقت. المضيف هو اللي بيحدد الوقت (من ١٥ لـ ٩٠ ثانية). اكتب ٥ أفلام أو مسلسلات اشتغل فيها."],
      ["✅", "كل عنوان بيتراجع فوراً: صح بيتحسب، غلط تجرب غيره. نفس الفيلم مش بيتحسب مرتين."],
      ["🏆", "٢٠ نقطة لكل عنوان صح، +٢٠ لو كملت الـ ٥، + لحد ١٠ نقط بونص لو خلصتهم بدري."],
    ],
  },
  {
    title: "🔗 الرابط المشترك",
    rules: [
      ["🎞️", "بنعرض ٣ أعمال، واكتب الممثل اللي اشتغل في كلهم. بعدين بنزود عمل رابع، وبعدين أشهر أعماله والحروف الأولى من اسمه."],
      ["🏆", "نفس نقط «أفيش»: ١٠٠ ثم ٧٠ ثم ٤٠، و+٢٠ لأول واحد."],
    ],
  },
  {
    title: "💬 الإفيه",
    rules: [
      ["💬", "بنعرض جملة مشهورة، واكتب اسم الفيلم أو المسلسل اللي هي منه."],
      ["📅", "بعد شوية بنديك السنة والنوع، وبعدين اللي قالها. نقط «أفيش»: ١٠٠ ثم ٧٠ ثم ٤٠."],
    ],
  },
  {
    title: "📅 قبل ولا بعد؟",
    rules: [
      ["👆", "عملين قدامك: دوس على اللي نزل الأول. معاك ١٠ ثواني."],
      ["🏆", "١٠٠ نقطة للصح + لحد ٥٠ للسرعة. المضيف يختار الفرق بين السنتين: كبير (سهل) أو صغير (صعب)."],
    ],
  },
  {
    title: "🕵️ مين مش منهم؟",
    rules: [
      ["📸", "٤ ممثلين: ٣ منهم اشتغلوا في نفس العمل. دوس على الدخيل. معاك ١٥ ثانية."],
      ["🏆", "١٠٠ نقطة للصح + لحد ٥٠ للسرعة. بعد الإجابة بنقولك العمل اللي كانوا فيه."],
    ],
  },
  {
    title: "🎭 أفلام",
    rules: [
      ["👥", "المضيف بيحدد الفريقين (ممكن يغيّر أسماءهم) وكل لاعب يدخل بيختار فريقه. أي عدد: ٥ ضد ٥، ١٠ ضد ١٠…"],
      ["🤫", "بالدور، كل فريق بياخد اسم فيلم أو مسلسل ويختار واحد منه يمثّله في الوقت اللي حدده المضيف من غير كلام. اسم العمل بيظهر على موبايل اللي بيمثّل بس، وبيتبعت مشفّر. كل واحد في الفريق بياخد دور قبل ما أي حد يعيد."],
      ["⌨️", "الفريق التاني بيكتب تخمينه في التطبيق. أول واحد يعرف بياخد لحد ١٠٠ نقطة لفريقه، واللي مثّل بياخد ٥٠ لفريقه."],
      ["⏭️", "اللي بيمثّل ممكن يغيّر العنوان مرة واحدة قبل ما حد يخمّن. في الآخر الفريق صاحب أعلى نقط بيكسب."],
    ],
  },
  {
    title: "⛓️ سلسلة",
    rules: [
      ["🔗", "بنبدأ بعمل. كل واحد في دوره (١٥ ثانية): اللي عليه الدور يقول ممثل من العمل، والتاني يقول عمل تاني للممثل ده، وهكذا."],
      ["❤️", "معاك ٣ قلوب. بتخسر قلب لو الوقت خلص أو جربت ٥ إجابات غلط. مفيش تكرار في السلسلة."],
      ["🏆", "١٠ نقط لكل حلقة صح، و+٥٠ لآخر واحد يفضل."],
    ],
  },
];

function RuleList({ rules }: { rules: Rules }) {
  return (
    <ul className="space-y-3">
      {rules.map(([icon, text]) => (
        <li key={icon + text} className="panel flex items-start gap-3 p-4">
          <span className="text-2xl">{icon}</span>
          <span className="font-semibold leading-relaxed">{text}</span>
        </li>
      ))}
    </ul>
  );
}

export default function AboutPage() {
  return (
    <>
      <TopBar />
      <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
        <h1 className="display text-5xl">إزاي تلعب</h1>
        <RuleList rules={COMMON} />
        {GAMES.map((g) => (
          <section key={g.title} className="space-y-3">
            <h2 className="display text-4xl">{g.title}</h2>
            <RuleList rules={g.rules} />
          </section>
        ))}

        <section className="panel space-y-2 p-5 text-sm leading-relaxed text-muted">
          <h2 className="display text-2xl text-ink">المصادر والحقوق</h2>
          <p>كل الأفلام والمسلسلات والممثلين في اللعبة من فترة ٢٠٠٠ لحد ٢٠١٠.</p>
          <p>
            بيانات الأفلام والمسلسلات وأطقم التمثيل والبوسترات مأخوذة من IMDb و Wikidata و TMDB. صور الممثلين من{" "}
            <a className="underline hover:text-ink" href="https://www.themoviedb.org/" target="_blank" rel="noreferrer">
              TMDB
            </a>{" "}
            و{" "}
            <a className="underline hover:text-ink" href="https://commons.wikimedia.org/" target="_blank" rel="noreferrer">
              Wikimedia Commons
            </a>{" "}
            و{" "}
            <a className="underline hover:text-ink" href="https://elcinema.com/" target="_blank" rel="noreferrer">
              السينما.كوم
            </a>
            .
          </p>
          <p dir="ltr" className="text-start">
            This product uses the TMDB API but is not endorsed or certified by TMDB. Actor photos from Wikimedia Commons are
            used under their respective free licenses.
          </p>
          <p>مفيش حسابات ولا قاعدة بيانات — النتايج بتتحفظ على موبايلك بس.</p>
        </section>

        <Link href="/" className="btn btn-primary w-full">
          يلا نلعب 🎬
        </Link>
      </main>
    </>
  );
}
