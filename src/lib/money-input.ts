/** Teto do valor digitado: 13 dígitos inteiros (até R$ 9.999.999.999.999,99). */
export const MAX_INT_DIGITS = 13;

/**
 * Formata o que é digitado num campo de valor no padrão brasileiro:
 * ponto separa milhares, vírgula separa centavos (máx. 2 casas).
 * Permite digitação contínua empurrando a vírgula quando passa de 2 casas decimais.
 */
export function formatMoneyInput(raw: string): string {
  let clean = raw.replace(/[^\d,]/g, "");

  // Regra de "transbordo": se a casa decimal passar de 2 dígitos, empurra a vírgula para a direita.
  const commaIdx = clean.indexOf(",");
  if (commaIdx !== -1) {
    const afterComma = clean.slice(commaIdx + 1).replace(/,/g, "");
    if (afterComma.length > 2) {
      const onlyNumbers = clean.replace(/,/g, "");
      // Passou do teto de dígitos inteiros: o dígito extra é ignorado
      if (onlyNumbers.replace(/^0+(?=\d)/, "").length - 2 > MAX_INT_DIGITS) {
        clean = clean.slice(0, commaIdx + 1 + 2);
      } else {
        // Reposiciona a vírgula para garantir que fiquem sempre 2 casas no final
        clean = onlyNumbers.slice(0, -2) + "," + onlyNumbers.slice(-2);
      }
    }
  }

  const newCommaIdx = clean.indexOf(",");
  const intRaw = newCommaIdx === -1 ? clean : clean.slice(0, newCommaIdx);
  const decRaw = newCommaIdx === -1 ? null : clean.slice(newCommaIdx + 1).replace(/,/g, "").slice(0, 2);
  const intDigits = intRaw.replace(/^0+(?=\d)/, "").slice(0, MAX_INT_DIGITS);
  const intFmt = intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  
  if (decRaw === null) return intFmt;
  return `${intFmt || "0"},${decRaw}`;
}

/** Valor numérico de um texto no padrão brasileiro ("50.000,50" -> 50000.5). */
export function parseMoneyInput(input: string): number {
  return Number(input.replace(/\s|R\$/g, "").replace(/\./g, "").replace(",", "."));
}

/**
 * Casas decimais que ainda faltam no que foi digitado, para mostrar clarinho.
 * "" -> "", "10" -> ",00", "10," -> "00", "10,5" -> "0", "10,50" -> "".
 */
export function moneyGhostSuffix(value: string): string {
  if (!value) return "";
  const i = value.indexOf(",");
  if (i === -1) return ",00";
  return "0".repeat(Math.max(0, 2 - (value.length - i - 1)));
}

/**
 * Resultado de uma tecla digitada: o texto do campo e uma "memória" que diz se
 * a vírgula atual veio de um ponto digitado (ex.: 2.5). A memória serve para,
 * na 3ª casa (ex.: 1.000), saber que aquele ponto era de milhar.
 */
export type MoneyTypingResult = { value: string; fromDot: boolean };

/**
 * Entende o ponto digitado. Recebe o texto de antes (prev), o texto novo (raw)
 * e a memória. Ponto + 1 ou 2 números = centavos (2.5 -> 2,5); ponto + 3 números
 * = milhar (1.000). Sem ponto, o resultado é igual ao de formatMoneyInput.
 */
export function formatMoneyTyping(prev: string, raw: string, fromDot: boolean): MoneyTypingResult {
  // 1) Ponto digitado no fim, depois de um número e antes de qualquer vírgula: vira vírgula.
  if (raw === prev + "." && /\d$/.test(prev) && !prev.includes(",")) {
    return { value: formatMoneyInput(prev + ","), fromDot: true };
  }

  // 2) A vírgula veio de um ponto e chegou o 3º número depois dela: o ponto era de milhar.
  if (
    fromDot &&
    raw.startsWith(prev) &&
    /^\d+,\d\d$/.test(prev.replace(/\./g, "")) &&
    /^\d$/.test(raw.slice(prev.length))
  ) {
    return { value: formatMoneyInput(raw.replace(/\D/g, "")), fromDot: false };
  }

  // 3) Colar num campo vazio: o último ponto com 1 ou 2 números depois são os centavos.
  if (prev === "" && raw.length > 1 && !raw.includes(",")) {
    const text = raw.replace(/\s|R\$/g, "");
    const i = text.lastIndexOf(".");
    if (i > 0 && /^\d[\d.]*$/.test(text.slice(0, i)) && /^\d{1,2}$/.test(text.slice(i + 1))) {
      const reais = text.slice(0, i).replace(/\./g, "");
      return { value: formatMoneyInput(reais + "," + text.slice(i + 1)), fromDot: false };
    }
  }

  // 4) Todo o resto: igual ao que já existe hoje.
  const value = formatMoneyInput(raw);
  return { value, fromDot: value.includes(",") ? fromDot : false };
}
