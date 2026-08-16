import { Button, Heading, Text } from "@vibe/core";
import { useAuth } from "../data/AuthProvider";
import "./SignInPage.css";

/**
 * The way in.
 *
 * One provider, deliberately: Microsoft Entra. There is no email-and-password form here
 * because Lofty does not want a second set of credentials to manage — the directory
 * already decides who works here, and single-tenant Entra means only a Lofty account
 * reaches the consent screen at all. Every other route redirects here until a session
 * exists, so this page is the whole surface an unauthenticated visitor can see.
 *
 * It is a page rather than a modal because it is also where sign-in failures have to be
 * readable: an expired client secret or a redirect URL missing from the allow list comes
 * back as a message, and a message needs somewhere to live.
 */
export function SignInPage() {
  const { signIn, status, error } = useAuth();
  const busy = status === "loading";

  return (
    <main className="signin" role="main">
      <div className="signin-card">
        <img src="/lofty_logo_orange.png" alt="Lofty" className="signin-logo" />

        <Heading type="h2" weight="bold">Job Oversight Board</Heading>
        <Text type="text2" color="secondary" ellipsis={false}>
          Sign in with your Lofty Microsoft account to continue.
        </Text>

        {error && (
          <div className="signin-error" role="alert">
            <Text type="text2" element="span" ellipsis={false}>
              <strong>Sign-in failed.</strong> {error}
            </Text>
          </div>
        )}

        {status === "unavailable" ? (
          /* No Supabase client in this build, so the button could not work. Saying so
             beats a button that silently does nothing — and it is a build-time state,
             not something a visitor can put the app into. */
          <div className="signin-error" role="alert">
            <Text type="text2" element="span" ellipsis={false}>
              <strong>Not configured.</strong> This build has no{" "}
              <code className="sb-token">VITE_SUPABASE_URL</code> or{" "}
              <code className="sb-token">VITE_SUPABASE_PUBLISHABLE_KEY</code>, so there is
              nothing to sign in to.
            </Text>
          </div>
        ) : (
          <Button size="large" loading={busy} onClick={() => void signIn()}>
            Continue with Microsoft
          </Button>
        )}

        <Text type="text3" color="secondary" ellipsis={false}>
          Accounts are managed in Microsoft Entra. If you cannot get in, ask an
          administrator to check your directory account rather than resetting a password
          here — there isn't one.
        </Text>
      </div>
    </main>
  );
}
