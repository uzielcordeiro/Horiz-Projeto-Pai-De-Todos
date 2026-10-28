import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"
import Stripe from "https://esm.sh/stripe@12.18.0?target=deno"

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") as string, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
})

const cryptoProvider = Stripe.createSubtleCryptoProvider()

serve(async (req) => {
  // Trata requisições de teste e preflight (CORS)
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } })
  }

  const signature = req.headers.get("Stripe-Signature")
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")

  if (!signature || !webhookSecret) {
    console.error("Assinatura ou Secret do Webhook ausente nas variáveis de ambiente.")
    return new Response("Webhook signature or secret missing", { status: 400 })
  }

  try {
    const body = await req.text()
    
    // Valida criptograficamente se o evento veio realmente do Stripe
    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
      undefined,
      cryptoProvider
    )

    console.log(`Evento recebido do Stripe: ${event.type}`)

    // Ignora silenciosamente eventos que não sejam a conclusão do checkout,
    // retornando 200 OK para evitar que a Stripe registre falhas (erro 400)
    if (event.type !== "checkout.session.completed") {
      return new Response(JSON.stringify({ received: true, ignored: true }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      })
    }

    // Processa a conclusão do checkout/pagamento
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session

      // Inicializa o Supabase Admin usando a Service Role
      // As opções de auth desligam as sessões em segundo plano, o que elimina o erro "Deno.core.runMicrotasks()"
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        }
      )

      const customerEmail = session.customer_details?.email
      const customerId = session.customer as string
      const subscriptionId = session.subscription as string

      console.log(`Sucesso no pagamento! Email: ${customerEmail} | Customer: ${customerId}`)

      // Atualiza ou insere o registro do cliente/assinatura no Supabase
      if (customerEmail) {
        const { error } = await supabaseAdmin
          .from("profiles")
          .update({
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            subscription_status: "active",
            updated_at: new Date().toISOString(),
          })
          .eq("email", customerEmail)

        if (error) {
          console.error("Erro ao atualizar o perfil no Supabase:", error.message)
        } else {
          console.log(`Perfil atualizado com sucesso no banco para ${customerEmail}`)
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    })
  } catch (err: any) {
    console.error(`Falha na validação do Webhook: ${err.message}`)
    return new Response(`Webhook Error: ${err.message}`, { status: 400 })
  }
})
