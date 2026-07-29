export default function Home() {
  return (
    <main className="px-5 py-12 text-white sm:px-8 sm:py-20">
      <section className="mx-auto max-w-2xl border-4 border-yellow-300 bg-[#172331] p-6 text-center shadow-[8px_8px_0_#020617] sm:p-10">
        <p className="font-mono text-xs font-black uppercase tracking-[0.24em] text-cyan-200">
          TipParta
        </p>
        <h1 className="mt-4 text-4xl font-black uppercase leading-none sm:text-6xl">
          Ďalší turnaj sa pripravuje
        </h1>
        <p className="mx-auto mt-6 max-w-lg font-mono text-sm font-bold leading-6 text-slate-200">
          Momentálne tu nie sú žiadne zápasy, výsledky, hráči ani tipy. Uvidíme sa pri ďalšom výkope.
        </p>
      </section>
    </main>
  );
}
