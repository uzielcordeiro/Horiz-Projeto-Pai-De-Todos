/**
 * LEITOR EM FATIAS
 *
 * O Supabase entrega no máximo 1.000 linhas por leitura e NÃO avisa quando corta o resto.
 * Este leitor pede a lista em fatias (de 1.000 em 1.000) até juntar tudo.
 *
 * - Pede o total exato ao banco (count) e continua até juntar esse total. Se o limite do projeto for
 *   menor que 1.000, ele só avança pelo que o banco realmente devolveu, sem pular linhas.
 * - Se uma fatia falhar, devolve o erro e NENHUM dado: nunca entrega meia lista como se fosse tudo.
 * - Se o banco repetir uma linha entre duas fatias, ela entra uma vez só (pelo id).
 */

export type ErroDeLeitura = { message: string; code?: string };

export type RespostaDeLeitura<T> = {
  data: T[] | null;
  error: ErroDeLeitura | null;
  status?: number;
  count?: number | null;
};

export const TAMANHO_DA_FATIA = 1000;

export async function lerTodasAsPaginas<T extends { id?: unknown }>(
  buscar: (de: number, ate: number) => PromiseLike<RespostaDeLeitura<T>>,
  tamanho: number = TAMANHO_DA_FATIA,
): Promise<{ data: T[] | null; error: ErroDeLeitura | null; status: number }> {
  const vistos = new Set<unknown>();
  const todos: T[] = [];
  let total: number | null = null;
  let de = 0;

  for (;;) {
    const res = await buscar(de, de + tamanho - 1);
    if (res.error) return { data: null, error: res.error, status: res.status ?? 0 };

    const fatia = res.data ?? [];
    if (typeof res.count === "number") total = res.count;

    for (const linha of fatia) {
      const id = linha.id;
      if (id !== undefined && id !== null) {
        if (vistos.has(id)) continue;
        vistos.add(id);
      }
      todos.push(linha);
    }

    if (fatia.length === 0) break;
    if (total !== null) {
      if (todos.length >= total) break;
    } else if (fatia.length < tamanho) {
      break;
    }
    // Avança pelo que o banco realmente devolveu (ele pode ter cortado antes de 1.000).
    de += fatia.length;
  }

  return { data: todos, error: null, status: 200 };
}
