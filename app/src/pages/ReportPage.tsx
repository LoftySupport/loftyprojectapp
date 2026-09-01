import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, Heading, Text } from "@vibe/core";
import { ReportForm } from "../components/ReportForm";
import { useAuth } from "../data/AuthProvider";
import "../components/ui.css";
import "./ReportPage.css";

/**
 * `/report` — the form as a page of its own (Amber, 1 Sep: *"a standalone page (as well
 * as slide out) so that I can share it with people who are not able to access the
 * account"*).
 *
 * ============================================================================
 * WHO CAN REACH THIS, AND WHY IT IS NOT A PUBLIC PAGE
 *
 *   It sits behind sign-in, and outside the demo gate. That combination is the whole
 *   point: a person held at the gate (0049) has a real profile, a real name and a real
 *   session — what they lacked was permission to write one table, which `0075` gave
 *   them. So the link works for exactly the people Amber wants to send it to, and the
 *   request that arrives has their name on it.
 *
 *   An anonymous page would have been the other reading of "not able to access the
 *   account". It needs `anon` INSERT, which puts a writable table on the public
 *   internet, loses who asked, and brings spam and a captcha with it — all to serve
 *   people who are already signed in. The argument is written out at the top of `0075`.
 *
 *   VIEWERS were never blocked. `anyone active reports` (0052) asks only for an active
 *   profile, so the lowest rung on the ladder could always file a request; this page
 *   just gives them somewhere to do it that is not a footer button.
 * ============================================================================
 *
 * No shell, no nav. Somebody arriving on this link either cannot use the rest of the app
 * or has been sent here to do one thing, and a full navigation frame around a single form
 * is an invitation to wander off into screens that will refuse them.
 */
export function ReportPage() {
  const { profile } = useAuth();
  const [sent, setSent] = useState(false);

  return (
    <main className="report-page">
      <div className="report-card">
        <Heading type="h2">Tell Lofty what you need</Heading>
        <Text type="text2" color="secondary" element="p" ellipsis={false}>
          A bug, an idea, anything that would make the app easier. It goes straight onto
          the tracker with your name on it.
        </Text>

        {sent ? (
          /* The receipt. A held account cannot open the tracker to check, so this screen
             is the only confirmation they will get — which is why it says where the
             request went rather than just "thanks". */
          <div className="report-done" role="status">
            <Heading type="h3">That's in.</Heading>
            <Text type="text2" element="p" ellipsis={false}>
              It has been added to the tracker as <strong>Requested</strong>, under
              {" "}{profile?.fullName ?? "your name"}. Amber sees every one of these.
            </Text>
            <div className="report-actions">
              <Button onClick={() => setSent(false)}>Send another</Button>
              {/* Only offered to people who can actually open it. For a held account this
                  link would land on the gate screen, which reads as being turned away
                  immediately after being thanked. */}
              {!profile?.isDemo && (
                <Link className="link-button" to="/updates">See what's planned</Link>
              )}
            </div>
          </div>
        ) : (
          <ReportForm showActions onSent={() => setSent(true)} />
        )}
      </div>

      <Text type="text3" color="secondary" element="p" ellipsis={false} className="report-foot">
        Signed in as {profile?.fullName ?? "—"}
        {profile?.isDemo && " · your account is set up for a walkthrough, so the rest of the app is closed for now"}
      </Text>
    </main>
  );
}
