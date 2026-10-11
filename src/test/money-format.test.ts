import { describe, expect, it } from "vitest";
import { compactBrl } from "@/lib/money-format";

describe("compactBrl", () => {
  it("10 mil vira 10 mil", () => expect(compactBrl(10000)).toBe("R$ 10 mil"));
  it("20 mil vira 20 mil", () => expect(compactBrl(20000)).toBe("R$ 20 mil"));
  it("1 milhão vira 1 mi", () => expect(compactBrl(1_000_000)).toBe("R$ 1 mi"));
  it("1 bilhão vira 1 bi", () => expect(compactBrl(1_000_000_000)).toBe("R$ 1 bi"));
  it("negativos mantêm o sinal", () => expect(compactBrl(-1_000_000_000)).toBe("-R$ 1 bi"));
  it("1,5 milhão vira 1,5 mi", () => expect(compactBrl(1_500_000)).toBe("R$ 1,5 mi"));
  it("1 trilhão vira 1 tri", () => expect(compactBrl(1e12)).toBe("R$ 1 tri"));
  it("4 trilhões viram 4 tri", () => expect(compactBrl(4e12)).toBe("R$ 4 tri"));
  it("600 trilhões viram 600 tri", () => expect(compactBrl(6e14)).toBe("R$ 600 tri"));
  it("1 quatrilhão vira 1 qua", () => expect(compactBrl(1e15)).toBe("R$ 1 qua"));
  it("720 quatrilhões viram 720 qua", () => expect(compactBrl(7.2e17)).toBe("R$ 720 qua"));
  it("1 quintilhão vira 1 qui", () => expect(compactBrl(1e18)).toBe("R$ 1 qui"));
  it("1 sextilhão vira 1 sex", () => expect(compactBrl(1e21)).toBe("R$ 1 sex"));
  it("1 septilhão vira 1 sep", () => expect(compactBrl(1e24)).toBe("R$ 1 sep"));
  it("1 octilhão vira 1 oct", () => expect(compactBrl(1e27)).toBe("R$ 1 oct"));
  it("1 nonilhão vira 1 non", () => expect(compactBrl(1e30)).toBe("R$ 1 non"));
  it("1 decilhão vira 1 dec", () => expect(compactBrl(1e33)).toBe("R$ 1 dec"));
  it("negativo de trilhão mantém o sinal", () => expect(compactBrl(-6e12)).toBe("-R$ 6 tri"));
  it("negativo de quintilhão mantém o sinal", () => expect(compactBrl(-2.5e18)).toBe("-R$ 2,5 qui"));
  it("sem símbolo funciona em qualquer escala", () =>
    expect(compactBrl(3e21, false)).toBe("3 sex"));
});
