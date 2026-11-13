import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findMainScript, hasNewVersion, startVersionCheck } from "@/lib/version-check";

/**
 * FISCAL DO AVISO DE VERSÃO NOVA
 * Garante: acha o arquivo principal, só avisa quando o nome muda, não avisa duas vezes
 * pela mesma versão, não alarma quando não acha nada, e para quando mandam parar.
 */

const PAGINA_ATUAL = `<html><head><link rel="stylesheet" href="/assets/styles-3PKO_UGS.css"></head>
<body><script type="module" src="/assets/index-DYGFNvCG.js"></script></body></html>`;
const PAGINA_NOVA = PAGINA_ATUAL.replace("DYGFNvCG", "Zz9_aB-1");

describe("findMainScript", () => {
  it("acha o arquivo principal no HTML", () => {
    expect(findMainScript(PAGINA_ATUAL)).toBe("/assets/index-DYGFNvCG.js");
  });
  it("aceita _ e - no nome", () => {
    expect(findMainScript(PAGINA_NOVA)).toBe("/assets/index-Zz9_aB-1.js");
  });
  it("devolve null quando não acha", () => {
    expect(findMainScript("<html></html>")).toBeNull();
    expect(findMainScript("")).toBeNull();
  });
  it("não confunde com outros arquivos", () => {
    expect(findMainScript('<script src="/assets/planos-BjLYDiVV.js"></script>')).toBeNull();
  });
});

describe("hasNewVersion", () => {
  it("só é versão nova quando os dois existem e diferem", () => {
    expect(hasNewVersion("/assets/index-A.js", "/assets/index-B.js")).toBe(true);
    expect(hasNewVersion("/assets/index-A.js", "/assets/index-A.js")).toBe(false);
    expect(hasNewVersion(null, "/assets/index-B.js")).toBe(false);
    expect(hasNewVersion("/assets/index-A.js", null)).toBe(false);
    expect(hasNewVersion(null, null)).toBe(false);
  });
});

describe("startVersionCheck", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.head.innerHTML = '<script type="module" src="/assets/index-DYGFNvCG.js"></script>';
  });
  afterEach(() => {
    vi.useRealTimers();
    document.head.innerHTML = "";
  });

  it("avisa uma vez só quando sai versão nova e não repete para a mesma", async () => {
    const aviso = vi.fn();
    const stop = startVersionCheck(aviso, { intervalMs: 1000, fetchHtml: async () => PAGINA_NOVA });
    await vi.advanceTimersByTimeAsync(3500);
    expect(aviso).toHaveBeenCalledTimes(1);
    stop();
  });

  it("avisa de novo se sair uma versão ainda mais nova", async () => {
    const aviso = vi.fn();
    let pagina = PAGINA_NOVA;
    const stop = startVersionCheck(aviso, { intervalMs: 1000, fetchHtml: async () => pagina });
    await vi.advanceTimersByTimeAsync(1500);
    pagina = PAGINA_ATUAL.replace("DYGFNvCG", "Outra123");
    await vi.advanceTimersByTimeAsync(1000);
    expect(aviso).toHaveBeenCalledTimes(2);
    stop();
  });

  it("não avisa quando a versão é a mesma", async () => {
    const aviso = vi.fn();
    const stop = startVersionCheck(aviso, { intervalMs: 1000, fetchHtml: async () => PAGINA_ATUAL });
    await vi.advanceTimersByTimeAsync(3500);
    expect(aviso).not.toHaveBeenCalled();
    stop();
  });

  it("não avisa quando a página publicada não tem o arquivo principal", async () => {
    const aviso = vi.fn();
    const stop = startVersionCheck(aviso, { intervalMs: 1000, fetchHtml: async () => "<html></html>" });
    await vi.advanceTimersByTimeAsync(3500);
    expect(aviso).not.toHaveBeenCalled();
    stop();
  });

  it("falha na busca não derruba nem avisa; tenta de novo depois", async () => {
    const aviso = vi.fn();
    let falha = true;
    const stop = startVersionCheck(aviso, {
      intervalMs: 1000,
      fetchHtml: async () => {
        if (falha) throw new Error("sem internet");
        return PAGINA_NOVA;
      },
    });
    await vi.advanceTimersByTimeAsync(2500);
    expect(aviso).not.toHaveBeenCalled();
    falha = false;
    await vi.advanceTimersByTimeAsync(1000);
    expect(aviso).toHaveBeenCalledTimes(1);
    stop();
  });

  it("não faz nada quando a própria página não tem o arquivo principal", async () => {
    document.head.innerHTML = "";
    const aviso = vi.fn();
    const fetchHtml = vi.fn(async () => PAGINA_NOVA);
    const stop = startVersionCheck(aviso, { intervalMs: 1000, fetchHtml });
    await vi.advanceTimersByTimeAsync(3500);
    expect(fetchHtml).not.toHaveBeenCalled();
    expect(aviso).not.toHaveBeenCalled();
    stop();
  });

  it("confere ao voltar para a aba", async () => {
    const aviso = vi.fn();
    const stop = startVersionCheck(aviso, { intervalMs: 60_000, fetchHtml: async () => PAGINA_NOVA });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(10);
    expect(aviso).toHaveBeenCalledTimes(1);
    stop();
  });

  it("depois de parar, não confere mais", async () => {
    const aviso = vi.fn();
    const stop = startVersionCheck(aviso, { intervalMs: 1000, fetchHtml: async () => PAGINA_NOVA });
    stop();
    await vi.advanceTimersByTimeAsync(3500);
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(10);
    expect(aviso).not.toHaveBeenCalled();
  });
});
