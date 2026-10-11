export const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const UNITS: [number, string][] = [
  [1e33, " dec"],
  [1e30, " non"],
  [1e27, " oct"],
  [1e24, " sep"],
  [1e21, " sex"],
  [1e18, " qui"],
  [1e15, " qua"],
  [1e12, " tri"],
  [1e9, " bi"],
  [1e6, " mi"],
  [1e3, " mil"],
];

/** Short form: 10000 -> "R$ 10 mil", 1500000 -> "R$ 1,5 mi", -1e9 -> "-R$ 1 bi". */
export function compactBrl(v: number, withSymbol = true): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  const prefix = withSymbol ? "R$ " : "";
  for (const [size, label] of UNITS) {
    if (abs >= size) {
      const n = Math.floor((abs / size) * 10) / 10;
      return `${sign}${prefix}${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}${label}`;
    }
  }
  return `${sign}${prefix}${Math.floor(abs).toLocaleString("pt-BR")}`;
}

/** Arredonda para centavos exatos (evita sobras tipo 0,0000001 em somas/subtrações). */
export const cents = (v: number): number => {
  const r = Math.round((v + Number.EPSILON * Math.sign(v)) * 100) / 100;
  return r === 0 ? 0 : r;
};
