import { EmptyState, Heading } from "@vibe/core";
import type { ReactNode } from "react";

/**
 * A page with its chrome in place and nothing to show yet. Every screen starts here
 * and grows real content as its table comes online — which also means the empty states
 * get designed rather than discovered on a fresh tenant.
 */
/**
 * A page's heading, and nothing under it.
 *
 * Amber, 12 September: *"on all pages remove descriptive line text under page header …
 * we need the most above the fold possible"*. The subtitle went from every page in the
 * app, and the prop with it rather than being accepted and ignored — a prop nobody
 * renders is a sentence somebody writes and never sees.
 *
 * Where the line carried a COUNT rather than a description, the count was already said
 * again by the toolbar ("Showing 118 of 118 projects") or by a readout beside the
 * heading. The one number that only lived there is the job total on the Projects page;
 * it is named in the commit rather than quietly kept.
 */
export function PageShell({
  title,
  children
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <>
      <div className="page-head">
        <Heading type="h2" weight="bold">{title}</Heading>
      </div>
      {children}
    </>
  );
}

export function NotWired({ table, description }: { table: string; description: string }) {
  return (
    <div className="panel">
      <EmptyState title={`${table} is not wired yet`} description={description} />
    </div>
  );
}
