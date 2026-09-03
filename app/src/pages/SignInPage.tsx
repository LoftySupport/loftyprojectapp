import { Button, Heading, Text } from "@vibe/core";
import { useAuth } from "../data/AuthProvider";
import { supabaseEnv } from "../data/supabaseEnv";
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

        <Heading type="h2" weight="bold">Lofty Hub</Heading>
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
             not something a visitor can put the app into.

             It names which half is missing, and both accepted spellings, because the
             first version of this message sent somebody to add two variables that were
             already set — Netlify's Supabase extension had written the same values under
             names of its own. "This build has no VITE_SUPABASE_URL" is a true sentence
             that pointed at the wrong fix, and the missing sentence was the one about
             build time. */
          <div className="signin-error" role="alert">
            <Text type="text2" element="span" ellipsis={false}>
              <strong>Not configured.</strong> This build has{" "}
              {supabaseEnv.urlUnusable
                ? "a Supabase URL that is not a project URL"
                : !supabaseEnv.hasUrl && !supabaseEnv.hasKey
                  ? "no Supabase project URL and no key"
                  : !supabaseEnv.hasUrl
                    ? "a Supabase key but no project URL"
                    : "a Supabase project URL but no key"}
              , so there is nothing to sign in to.
            </Text>
            <Text type="text3" element="span" ellipsis={false}>
              Either spelling is read:{" "}
              <code className="sb-token">VITE_SUPABASE_URL</code> and{" "}
              <code className="sb-token">VITE_SUPABASE_PUBLISHABLE_KEY</code>, or the
              Netlify Supabase extension's{" "}
              <code className="sb-token">VITE_SUPABASE_DATABASE_URL</code> and{" "}
              <code className="sb-token">VITE_SUPABASE_ANON_KEY</code>. They are read when
              the site is built, so a deploy that went out before they were set still
              shows this until it is built again.
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
