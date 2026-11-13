/**
 * AVISO DE VERSÃO NOVA
 *
 * Cada versão publicada do app gera um arquivo principal com nome novo (ex.: /assets/index-DYGFNvCG.js).
 * Este arquivo compara o nome do arquivo que está rodando com o da página publicada agora.
 * Se o nome mudou, saiu versão nova e o app avisa. Nada recarrega sozinho: quem decide a hora é o cliente.
 *
 * Se não achar o nome do arquivo (página diferente do esperado), não avisa nada: sem alarme falso.
 */

const MAIN_SCRIPT = /\/assets\/index-[A-Za-z0-9_-]+\.js/;

/** Acha o arquivo principal dentro de um texto HTML. Devolve null se não achar. */
export function findMainScript(html: string): string | null {
  const found = MAIN_SCRIPT.exec(html);
  return found ? found[0] : null;
}

/** Só há versão nova quando os dois nomes existem e são diferentes. */
export function hasNewVersion(running: string | null, latest: string | null): boolean {
  return Boolean(running) && Boolean(latest) && running !== latest;
}

type Options = {
  /** De quanto em quanto tempo confere. Padrão: 5 minutos. */
  intervalMs?: number;
  /** Para teste: de onde ler a página publicada. */
  fetchHtml?: () => Promise<string>;
};

/**
 * Começa a conferir. Devolve uma função que para tudo.
 * `onNewVersion` roda uma vez por versão nova (não repete para a mesma).
 */
export function startVersionCheck(onNewVersion: () => void, options: Options = {}): () => void {
  if (typeof document === "undefined") return () => {};

  const running = findMainScript(
    Array.from(document.querySelectorAll("script[src], link[href]"))
      .map((el) => el.getAttribute("src") ?? el.getAttribute("href") ?? "")
      .join("\n"),
  );
  if (!running) return () => {};

  const fetchHtml =
    options.fetchHtml ??
    (async () => {
      const res = await fetch(window.location.pathname, { cache: "no-store" });
      return res.ok ? await res.text() : "";
    });

  let announced: string | null = null;
  let stopped = false;

  const check = async () => {
    if (stopped) return;
    try {
      const latest = findMainScript(await fetchHtml());
      if (stopped || !hasNewVersion(running, latest) || latest === announced) return;
      announced = latest;
      onNewVersion();
    } catch {
      // Sem internet ou falha na busca: tenta de novo na próxima conferência.
    }
  };

  const onVisible = () => {
    if (document.visibilityState === "visible") void check();
  };

  const timer = window.setInterval(() => void check(), options.intervalMs ?? 5 * 60 * 1000);
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    stopped = true;
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
