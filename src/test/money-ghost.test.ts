import { describe, expect, it } from "vitest";
import { formatMoneyInput, formatMoneyTyping, moneyGhostSuffix } from "@/lib/money-input";

describe("casas decimais enquanto digita", () => {
  it("10 mostra ,00 faltando", () => expect(moneyGhostSuffix("10")).toBe(",00"));
  it("10,5 mostra 0 faltando", () => expect(moneyGhostSuffix("10,5")).toBe("0"));
  it("9,67 está completo", () => expect(moneyGhostSuffix("9,67")).toBe(""));
  it("vazio não mostra nada", () => expect(moneyGhostSuffix("")).toBe(""));
  it("valor grande ganha ponto", () => expect(formatMoneyInput("50000")).toBe("50.000"));
  it("valor pequeno só vírgula", () => expect(formatMoneyInput("10,5")).toBe("10,5"));
});

/** Digita uma tecla de cada vez, como no campo de verdade (com a memória do ponto). */
function digitar(texto: string): string {
  let value = "";
  let fromDot = false;
  for (const tecla of texto) {
    const r = formatMoneyTyping(value, value + tecla, fromDot);
    value = r.value;
    fromDot = r.fromDot;
  }
  return value;
}

describe("ponto digitado vira centavos", () => {
  it("2.5 vira 2,5", () => expect(digitar("2.5")).toBe("2,5"));
  it("2.50 vira 2,50", () => expect(digitar("2.50")).toBe("2,50"));
  it("2,50 continua 2,50", () => expect(digitar("2,50")).toBe("2,50"));
  it("0.50 vira 0,50", () => expect(digitar("0.50")).toBe("0,50"));
  it("1500.75 vira 1.500,75", () => expect(digitar("1500.75")).toBe("1.500,75"));
});

describe("ponto com 3 números continua sendo milhar", () => {
  it("1.000 continua 1.000", () => expect(digitar("1.000")).toBe("1.000"));
  it("1.500 continua 1.500", () => expect(digitar("1.500")).toBe("1.500"));
  it("2.500 continua 2.500", () => expect(digitar("2.500")).toBe("2.500"));
  it("1.234.567 continua 1.234.567", () => expect(digitar("1.234.567")).toBe("1.234.567"));
  it("12.345.678 continua igual", () => expect(digitar("12.345.678")).toBe("12.345.678"));
});

describe("o que já funcionava não muda", () => {
  it("1234,567 continua 12.345,67", () => expect(digitar("1234,567")).toBe("12.345,67"));
  it("sem ponto, igual ao de antes", () => expect(digitar("50000")).toBe("50.000"));
  it("apagar o último número de 1.234 dá 123", () =>
    expect(formatMoneyTyping("1.234", "1.23", false).value).toBe("123"));
  it("ponto repetido: 1..234 vira 1.234", () => expect(digitar("1..234")).toBe("1.234"));
});

describe("colar em campo vazio", () => {
  const colar = (texto: string) => formatMoneyTyping("", texto, false).value;
  it("2.5 vira 2,5", () => expect(colar("2.5")).toBe("2,5"));
  it("2.50 vira 2,50", () => expect(colar("2.50")).toBe("2,50"));
  it("1.000 continua 1.000", () => expect(colar("1.000")).toBe("1.000"));
  it("1500.75 vira 1.500,75", () => expect(colar("1500.75")).toBe("1.500,75"));
  it("1.500,75 continua 1.500,75", () => expect(colar("1.500,75")).toBe("1.500,75"));
  it("R$ 2.50 vira 2,50", () => expect(colar("R$ 2.50")).toBe("2,50"));
});
