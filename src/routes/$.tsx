import { createFileRoute, redirect } from "@tanstack/react-router";

// Catch-all: any URL that doesn't match a page (old links, typos, deep links)
// goes straight to the login page instead of the 404 screen, so shared links
// always land somewhere usable.
export const Route = createFileRoute("/$")({
  beforeLoad: () => {
    throw redirect({ to: "/login" });
  },
});
