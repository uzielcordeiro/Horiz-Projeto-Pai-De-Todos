import { describe, expect, it } from "vitest";
import { compactBrl } from "@/lib/money-format";

describe("compactBrl", () => {
    it("10 mil vira 10k", () => expect(compactBrl(10000)).toBe("R$ 10k"));
  it("20 mil vira 20k", () => expect(compactBrl(20000)).toBe("R$ 20k"));
  it("1 milhão vira 1M", () => expect(compactBrl(1_000_000)).toBe("R$ 1M"));
  it("1 bilhão vira 1B", () => expect(compactBrl(1_000_000_000)).toBe("R$ 1B"));
  it("negativos mantêm o sinal", () => expect(compactBrl(-1_000_000_000)).toBe("-R$ 1B"));
  it("1,5 milhão vira 1,5M", () => expect(compactBrl(1_500_000)).toBe("R$ 1,5M"));
  it("1 trilhão vira 1T", () => expect(compactBrl(1e12)).toBe("R$ 1T"));
  it("4 trilhões viram 4T", () => expect(compactBrl(4e12)).toBe("R$ 4T"));
  it("600 trilhões viram 600T", () => expect(compactBrl(6e14)).toBe("R$ 600T"));
  it("1 quatrilhão vira 1q", () => expect(compactBrl(1e15)).toBe("R$ 1q"));
  it("720 quatrilhões viram 720q", () => expect(compactBrl(7.2e17)).toBe("R$ 720q"));
  it("1 quintilhão vira 1Q", () => expect(compactBrl(1e18)).toBe("R$ 1Q"));
  it("999 mostra o valor inteiro com centavos", () => expect(compactBrl(999)).toBe("R$ 999,00"));
  it("1.000 vira 1k", () => expect(compactBrl(1000)).toBe("R$ 1k"));
  it("999.999 vira 999,99k (corta, não arredonda)", () => expect(compactBrl(999_999)).toBe("R$ 999,99k"));
  it("zero mostra R$ 0,00", () => expect(compactBrl(0)).toBe("R$ 0,00"));
  it("negativo abaixo de mil mantém o sinal", () => expect(compactBrl(-999)).toBe("-R$ 999,00"));
  it("negativo de trilhão mantém o sinal", () => expect(compactBrl(-6e12)).toBe("-R$ 6T"));
  it("negativo de quintilhão mantém o sinal", () => expect(compactBrl(-2.5e18)).toBe("-R$ 2,5Q"));
  it("sem símbolo funciona em qualquer escala", () =>
    expect(compactBrl(3e18, false)).toBe("3Q"));
});
