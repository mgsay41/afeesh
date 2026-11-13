import type { Metadata } from "next";
import Link from "next/link";
import { TopBar } from "@/components/common";

export const metadata: Metadata = { title: "أفيش — عن اللعبة" };

const RULES = [
  ["🎥", "المضيف يبدأ لعبة ويبعت الكود أو الـ QR لصحابه. المضيف بيلعب معاهم."],
  ["🎟️", "كل جولة بتبدأ بـ ٣ ممثلين في أدوار مساعدة، بعدين ممثل بدور أكبر، وفي الآخر الأبطال."],
  ["⌨️", "اكتب اسم الفيلم أو المسلسل بالعربي. مش لازم الإملاء يبقى مظبوط — لو قريب كفاية بتتحسب."],
  ["🔥", "لو قربت هيقولك «قربت!». معاك ٣ محاولات غلط في كل جولة."],
  ["💡", "المضيف ممكن يكشف تلميحات: النوع، السنة، فيلم ولا مسلسل. كل تلميح بيخصم ١٠ نقط."],
  ["🏆", "١٠٠ نقطة في المرحلة الأولى، ٧٠ في التانية، ٤٠ في التالتة، و+٢٠ لأول واحد يعرف."],
];

export default function AboutPage() {
  return (
    <>
      <TopBar />
      <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
        <h1 className="display text-5xl">إزاي تلعب</h1>
        <ul className="space-y-3">
          {RULES.map(([icon, text]) => (
            <li key={icon} className="panel flex items-start gap-3 p-4">
              <span className="text-2xl">{icon}</span>
              <span className="font-semibold leading-relaxed">{text}</span>
            </li>
          ))}
        </ul>

        <section className="panel space-y-2 p-5 text-sm leading-relaxed text-muted">
          <h2 className="display text-2xl text-ink">المصادر والحقوق</h2>
          <p>
            بيانات الأفلام والمسلسلات مأخوذة من IMDb و Wikidata. صور الممثلين من{" "}
            <a className="underline hover:text-ink" href="https://www.themoviedb.org/" target="_blank" rel="noreferrer">
              TMDB
            </a>{" "}
            و{" "}
            <a className="underline hover:text-ink" href="https://commons.wikimedia.org/" target="_blank" rel="noreferrer">
              Wikimedia Commons
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
