import { createFileRoute, useRouter } from "@tanstack/react-router";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade — HORIZ" },
      { name: "description", content: "Política de Privacidade e gestão de dados do HORIZ." },
    ],
  }),
  component: PrivacidadePage,
});

export function PrivacidadePage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-6 sm:p-10 shadow-sm">
        <div className="mb-8 border-b border-border pb-6">
          <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">Política de Privacidade</h1>
          <p className="mt-2 text-sm text-muted-foreground">Última atualização: 28 de Outubro de 2026</p>
        </div>

        <div className="space-y-6 text-sm leading-relaxed text-muted-foreground mb-10">
          <p>
            No HORIZ, a sua privacidade e a segurança dos seus dados financeiros são a nossa maior prioridade. Esta política explica como recolhemos, usamos e protegemos as suas informações, em conformidade com a legislação aplicável.
          </p>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-foreground">1. Dados que Recolhemos</h2>
            <p>
              Recolhemos apenas os dados estritamente necessários para o funcionamento da plataforma:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li><strong>Dados de Registo:</strong> Nome, e-mail e número de telefone (WhatsApp) fornecidos pelo utilizador.</li>
              <li><strong>Dados Financeiros:</strong> Os lançamentos, valores e projeções inseridos manualmente no calendário.</li>
              <li><strong>Dados de Acesso:</strong> Registos de data, hora e endereço de IP a cada início de sessão, mantidos sob sigilo.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-foreground">2. Processamento de Pagamentos</h2>
            <p>
              O HORIZ não tem acesso nem armazena números de cartões de crédito. Todo o fluxo de faturação é gerido de forma externa e encriptada pela Stripe (PCI-DSS).
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-foreground">3. Proteção e Armazenamento (RLS)</h2>
            <p>
              A nossa base de dados utiliza políticas rígidas de Row Level Security (RLS). A sua conta e os seus lançamentos financeiros estão matematicamente trancados ao seu ID exclusivo, sendo invisíveis para qualquer outro utilizador.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-foreground">4. Partilha de Dados</h2>
            <p>
              <strong className="text-foreground">Não vendemos, não alugamos e não partilhamos</strong> os seus dados pessoais ou o seu fluxo de caixa com terceiros, corretoras ou agências de publicidade.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-foreground">5. Eliminação da Conta</h2>
            <p>
              O utilizador tem o direito de solicitar a eliminação definitiva da sua conta e dos seus dados a qualquer momento através das configurações da plataforma. Retemos apenas os registos de ligação (Logs de IP) pelo período mínimo exigido por lei.
            </p>
          </section>
        </div>

        <div className="flex justify-center border-t border-border pt-6">
          <button
            onClick={() => router.history.back()}
            className="rounded-xl bg-primary px-10 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            voltar
          </button>
        </div>
      </div>
    </main>
  );
}
