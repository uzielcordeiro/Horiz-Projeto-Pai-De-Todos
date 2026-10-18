import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/components/LandingPage";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Horiz — O seu GPS Financeiro" },
    { name: "description", content: "Suas contas olhando para frente. Conheça o calendário financeiro Horiz e escolha seu plano mensal ou anual." },
    { property: "og:title", content: "Horiz — O seu GPS Financeiro" },
    { property: "og:description", content: "Controle o futuro das suas finanças com Horiz. Planos mensal e anual com acesso ao calendário financeiro." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: LandingPage,
});