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

## Finance UI
- Horizon day panels reuse the Calendar form and shared entry/recurrence mutations; this keeps calculations and stored records consistent across views.
- Automatic daily forecast edits retain their budget model and use day overrides; this preserves forward recalculation and exact monthly rounding.
- Horizon's compact launch list reuses CalendarItemLabel and monthItemLabel and opens the existing detail panel; this keeps descriptions and subsequent forms consistent with the Calendar.
- Horizon add flow tracks cameFromPick to show the "voltar" pill only in the Horizon pick→form flow; Calendar/Tags add flows keep it false so no back button appears there.
