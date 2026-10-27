export const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Sufixos do mercado financeiro padrão
const UNITS: [number, string][] = [
  [1e18, "Q"], // Quintilhões
  [1e15, "q"], // Quatrilhões
  [1e12, "T"], // Trilhões
  [1e9, "B"],  // Bilhões
  [1e6, "M"],  // Milhões
  [1e3, "k"],  // Mil
];

/** 
 * Formato curto: 10000 -> "R$ 10k", 1255400 -> "R$ 1,25M", -1e9 -> "-R$ 1B". 
 * Trunca para manter a precisão de 2 casas decimais sem arredondamentos enganosos.
 */
export function compactBrl(v: number, withSymbol = true): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  const prefix = withSymbol ? "R$ " : "";

  for (const [size, label] of UNITS) {
    if (abs >= size) {
      // Trunca matematicamente para 2 casas decimais
      const n = Math.floor((abs / size) * 100) / 100;
      return `${sign}${prefix}${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}${label}`;
    }
  }

  // Se for menor que 1000, exibe normalmente com os cêntimos
  return `${sign}${prefix}${abs.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Arredonda para cêntimos exatos (evita sobras tipo 0,0000001 em somas/subtrações). */
export const cents = (v: number): number => {
  const r = Math.round((v + Number.EPSILON * Math.sign(v)) * 100) / 100;
  return r === 0 ? 0 : r;
};
