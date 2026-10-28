import { createFileRoute, useRouter } from "@tanstack/react-router";

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title: "Termos de Uso — HORIZ" },
      { name: "description", content: "Termos de Uso e Condições de Serviço do HORIZ." },
    ],
  }),
  component: TermosPage,
});

export function TermosPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-6 sm:p-10 shadow-sm">
        <div className="mb-8 border-b border-border pb-6">
          <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">Termos de Uso</h1>
          <p className="mt-2 text-sm text-muted-foreground">Última atualização: 28 de Outubro de 2026</p>
        </div>

        <div className="space-y-6 text-sm leading-relaxed text-muted-foreground mb-10">
          <p>
            Bem-vindo ao HORIZ. Ao criar uma conta e utilizar o nosso software, você concorda expressamente com os termos e condições descritos abaixo. Se você não concorda com qualquer parte destes termos, não deve utilizar a plataforma.
          </p>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-foreground">1. Capacidade Civil</h2>
            <p>
              O uso do HORIZ é estritamente restrito a pessoas maiores de 18 (dezoito) anos. Ao criar a sua conta, declara sob as penas da lei ter capacidade civil plena para celebrar este contrato.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-foreground">2. Natureza da Ferramenta e Isenção de Consultoria</h2>
            <p>
              O HORIZ é exclusivamente um software SaaS (Software as a Service) de organização financeira e calendário.
              <strong className="block mt-2 text-foreground">O HORIZ NÃO é uma corretora de valores, NÃO fornece aconselhamento financeiro e NÃO emite recomendações de investimentos.</strong>
              Qualquer decisão financeira tomada com base nas projeções do aplicativo é de sua inteira responsabilidade. Isentamo-nos de qualquer responsabilidade por perdas financeiras.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-foreground">3. Assinaturas, Pagamentos e Reembolsos</h2>
            <p>
              O acesso às funcionalidades é fornecido mediante assinatura paga, processada pela plataforma Stripe.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li><strong>Arrependimento (7 dias):</strong> Em conformidade com o Código de Defesa do Consumidor (CDC), garantimos o reembolso integral caso o cancelamento seja solicitado em até 7 dias corridos após a primeira compra.</li>
              <li><strong>Cancelamento Padrão:</strong> Após os 7 dias iniciais, não há obrigação legal de reembolso. O cancelamento interrompe cobranças futuras, mantendo o acesso até o fim do período vigente já pago. Não realizamos estornos proporcionais.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-foreground">4. Disponibilidade (SLA) e Limitação de Responsabilidade</h2>
            <p>
              O serviço é fornecido "no estado em que se encontra" (as is). Não garantimos que a plataforma estará 100% livre de instabilidades técnicas.
            </p>
            <p>
              Em nenhuma hipótese o HORIZ será responsabilizado por lucros cessantes ou perda de dados. Caso haja qualquer condenação judicial, a responsabilidade máxima da empresa ficará estritamente limitada ao valor total pago pelo utilizador nos últimos 12 (doze) meses de assinatura, blindando o caixa da empresa contra litígios especulativos.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-foreground">5. Segurança da Conta</h2>
            <p>
              A segurança da conta depende do utilizador. O HORIZ não se responsabiliza por acessos indevidos decorrentes de partilha de senhas, uso de senhas fracas ou dispositivos comprometidos pelo utilizador.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-bold text-foreground">6. Ações Coletivas e Foro</h2>
            <p>
              Qualquer litígio será resolvido individualmente. O utilizador renuncia expressamente ao direito de participar de ações coletivas (class actions). Fica eleito o foro da sede da empresa para dirimir quaisquer dúvidas.
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
