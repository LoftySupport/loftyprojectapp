import { EmptyState, Heading, Text } from "@vibe/core";
import type { ReactNode } from "react";

/**
 * A page with its chrome in place and nothing to show yet. Every screen starts here
 * and grows real content as its table comes online — which also means the empty states
 * get designed rather than discovered on a fresh tenant.
 */
export function PageShell({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children?: ReactNode;
}) {
  return (
    <>
      <div className="page-head">
        <Heading type="h2" weight="bold">{title}</Heading>
        <Text type="text2" color="secondary">{subtitle}</Text>
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
