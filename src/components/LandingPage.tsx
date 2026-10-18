import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowUpRight, Check, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createCheckout } from "@/lib/billing.functions";
import { useServerFn } from "@tanstack/react-start";
import type { Plan } from "@/lib/plans";

export function LandingPage() {
  const checkout = useServerFn(createCheckout);
  const [busy, setBusy] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function subscribe(plan: Plan) {
    if (busy) return;
    setBusy(plan);
    setError(null);
    try {
      const { url } = await checkout({ data: { plan, origin: window.location.origin } });
      window.location.assign(url);
    } catch {
      setError("Não foi possível abrir o pagamento. Tente novamente em instantes.");
    } finally { setBusy(null); }
  }

  return (
    <main className="landing">
      <header className="landing-header">
        <Link to="/" className="landing-logo" aria-label="Horiz — início"><span className="landing-monogram">H</span><span>Horiz</span></Link>
        <nav aria-label="Navegação principal">
          <Button variant="ghost" asChild className="landing-nav-link"><a href="#planos">Planos</a></Button>
          <Button asChild className="landing-button landing-login"><Link to="/login">Já sou aluno <ArrowUpRight /></Link></Button>
        </nav>
      </header>

      <section className="landing-hero">
        <h1>Controle o futuro das suas finanças com Horiz</h1>
        <p>Suas contas olhando para frente e nunca mais para trás</p>
        <Button asChild className="landing-button landing-cta"><a href="#planos">Quero Fazer Parte <ArrowUpRight /></a></Button>
      </section>

      <section className="landing-showcase">
        <h2>Simples, direto e sem planilhas complexas</h2>
        <p>Tenha o controle total das suas finanças e do calendário com Horiz</p>
        <HorizonPreview />
      </section>

      <section id="planos" className="landing-pricing">
        <h2>Pronto para transformar sua vida financeira?</h2>
        <p className="landing-subtitle">Escolha o plano ideal para a sua jornada.</p>
        <div className="landing-pricing-grid">
          <article className="landing-price-card">
            <h3>Plano Mensal</h3>
            <p>Flexibilidade total, cancele quando quiser.</p>
            <div className="landing-price">R$ 27,00 <span>/mês</span></div>
            <div className="landing-subprice" aria-hidden="true">&nbsp;</div>
            <ul>{["Acesso completo ao painel e calendário", "Gestão descomplicada de entradas e saídas", "Suporte dedicado"].map(text => <li key={text}><Check />{text}</li>)}</ul>
            <Button className="landing-button landing-plan-button" disabled={busy !== null} onClick={() => void subscribe("monthly")}>{busy === "monthly" ? <><LoaderCircle className="animate-spin" /> abrindo…</> : "Assinar Mensal"}</Button>
          </article>
          <article className="landing-price-card landing-featured">
            <span className="landing-badge">Mais Popular</span>
            <h3>Plano Anual</h3>
            <p>Para quem quer consistência o ano todo.</p>
            <div className="landing-price">R$ 302,00</div>
            <div className="landing-subprice">à vista (equivalente a R$ 25,17 /mês)</div>
            <ul>{["Economia de 7% em relação ao plano mensal", "Painel completo de saldos e calendário", "Atualizações contínuas do app"].map(text => <li key={text}><Check />{text}</li>)}</ul>
            <Button className="landing-button landing-plan-button" disabled={busy !== null} onClick={() => void subscribe("yearly")}>{busy === "yearly" ? <><LoaderCircle className="animate-spin" /> abrindo…</> : "Assinar Anual"}</Button>
          </article>
        </div>
        {error && <p role="alert" className="landing-error">{error}</p>}
      </section>
    </main>
  );
}

function HorizonPreview() {
  const months = ["outubro", "novembro", "dezembro", "janeiro", "fevereiro", "março"];
  return <figure className="landing-preview" aria-label="Calendário Horizonte Horiz — exemplo ilustrativo">
    <div className="landing-preview-top"><strong>HORIZ</strong><span>Horizonte</span><span className="landing-preview-caption">Exemplo ilustrativo</span></div>
    <div className="landing-preview-scroll">
      <div className="landing-preview-months">{months.map((month, m) => <div key={month} className="landing-preview-month">
        <h3>{month} {m < 3 ? "2026" : "2027"}</h3>
        {Array.from({length: 13}, (_, i) => {
          const balance = 2600 + m * 430 - i * 240 + (i > 8 ? 1250 : 0);
          const color = balance >= 2000 ? "bg-surplus text-surplus-foreground" : balance >= 1000 ? "bg-horizon-positive-cell text-positive" : balance >= 0 ? "bg-horizon-warning-cell text-horizon-warning-text" : "bg-horizon-negative-cell text-negative";
          return <div key={i} className={`landing-preview-cell ${color}`}><span>{i + 1}</span><strong>{balance.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong></div>;
        })}
      </div>)}</div>
    </div>
  </figure>;
}