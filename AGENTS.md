<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep calendar reset controls in CalendarReset and provide an in-memory full-state restore callback from the calendar owner, so both reset scopes can be undone without changing existing storage formats.
- Keep whole-month gesture handling in useCalendarSwipe and month boundaries in calendar-navigation, so gestures and calendar arrows share the current-month limit without changing stored financial data or date pickers.
- Keep tag aggregation in tag-summary, with one date/repetition detail per source and occurrence-based totals, so the Tags list can describe installment plans without changing financial storage or calendar calculations.
- Keep Horizonte range generation and arrow bounds in calendar-navigation, so native scrolling and month/year navigation end at the same live-date boundary without changing financial storage.
- Keep Horizonte's today action in its owner and reset the windowed board's scroll and visible range in HorizonBoard, so both arrow navigation and native scrolling return to the live month without changing financial data.
- HorizonBoard renders only the month columns in view (fixed-width windowing) and mounts immediately on navigation, so the sidebar click stays instant; never reintroduce a deferred/placeholder mount.
- Subscription access (status gate, checkout, profile fields) lives in billing.functions + access.ts using the service role server-side, and Stripe events arrive at /api/public/stripe-webhook, so the external DB RLS never blocks gating or webhook writes.
- Keep global theme switching in ThemeToggle and semantic theme/shadow tokens in styles.css; use opaque invariant Horizon matrix tokens so changing surrounding surfaces never changes financial cell colors.
- Icons inside a shadcn Button are pinned to 16px by the base `[&_svg]:size-4` rule, so an icon's own `size` prop has no effect there; change a button icon's size with `[&_svg]:size-N` in the button's className.
- Keep sign-out in the shared useSignOut hook: cancel and clear the query cache, end the Supabase session, hold the SigningOut "Saindo..." overlay briefly, then replace-navigate to /login, so no protected data survives logout and the Back button cannot restore the app.
- Keep the remembered e-mail in the localStorage key 'remembered_email' — saved on a successful login and when "Lembrar de mim" is marked, cleared when unmarked — and prefill the login e-mail field from it, so returning users see their address without inventing another key.
- Scope every financial localStorage key to the signed-in user id via user-storage (legacy unscoped keys adopted once by the first account), so accounts sharing a browser never see each other's data and new accounts start empty.
- Keep the public landing page at / and the existing financial app at /app, so marketing never runs the app's session gate; successful authentication and checkout return to /app.
- Keep plan identifiers and amounts in plans.ts and accept only validated monthly/yearly checkout intent; landing checkout is public, while authenticated callers retain verified user metadata, so buying requires no login and navigation cannot choose arbitrary prices.
