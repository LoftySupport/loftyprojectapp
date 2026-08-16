import { Button, Heading, Text } from "@vibe/core";
import { useAuth } from "../data/AuthProvider";
import "./SignInPage.css";

/**
 * Signed in to Microsoft, but not on Lofty's list.
 *
 * This is the visible half of the rule that only people created in the app may use it.
 * Authentication succeeded — Entra vouched for them — and it bought nothing, because
 * access comes from a `profiles` row and there isn't one. Every RLS policy would deny
 * anyway; this exists so the person is told, rather than shown an empty board and left
 * to wonder whether it is broken.
 *
 * It names the address they signed in with, because that is the one fact an
 * administrator needs to fix it: the match is on `login_email`, and the usual cause is
 * that the row holds a different one.
 */
export function NotSetUpPage() {
  const { session, signOut } = useAuth();
  const email = session?.user.email;

  return (
    <main className="signin" role="main">
      <div className="signin-card">
        <img src="/lofty_logo_orange.png" alt="Lofty" className="signin-logo" />

        <Heading type="h2" weight="bold">Not set up yet</Heading>
        <Text type="text2" color="secondary" ellipsis={false}>
          You signed in to Microsoft successfully, but this account isn't on the Lofty
          team list, so there's nothing here for it yet.
        </Text>

        {email && (
          <div className="signin-note">
            <Text type="text2" element="span" ellipsis={false}>
              Signed in as <strong>{email}</strong>
            </Text>
          </div>
        )}

        <Text type="text3" color="secondary" ellipsis={false}>
          Ask an administrator to add you, or to check that the account above is the one
          on your profile — it's often the difference between a
          <code className="sb-token">@lofty.com.au</code> address and a
          <code className="sb-token">@loftybg.onmicrosoft.com</code> one.
        </Text>

        <Button size="large" kind="secondary" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </main>
  );
}
