import { Button, Heading, Text } from "@vibe/core";
import { useAuth } from "../data/AuthProvider";
import "../components/ui.css";

/**
 * The door a demo account reaches and does not pass (0049).
 *
 * Amber's shape, and her reason: "I don't want them in the app unless I am there with
 * them training them. That way they can't test and trial without me, but I don't have
 * to deactivate them."
 *
 * The copy is hers, near enough word for word: "they should not see anything past the
 * account except a message to say you do not have permission to access this page.
 * Please contact admin for approval." An earlier draft softened it into "you're all
 * set up, it just opens when somebody walks you through it" — friendlier, and wrong
 * in the way that costs time: it reads as a delay somebody else is handling, so the
 * person waits instead of asking, and the one action that opens the door never happens.
 *
 * No menus, no greyed-out screens, no preview of what they cannot have. A gate that
 * shows the app behind it is an invitation to try the handle.
 *
 * Nobody is named here. The screen is the same sentence for everybody who meets it, and
 * a greeting on a refusal reads as sarcasm. The profile is still read (the RLS exception
 * in 0049 lets a held account see its own row) — `RequireAuth` needs it to know this
 * person is held at all.
 */
export function DemoGatePage() {
  const { signOut } = useAuth();

  return (
    <div className="gate">
      <div className="gate-card">
        <Text type="text3" color="secondary" element="div" ellipsis={false}>Lofty</Text>
        <Heading type="h2" weight="bold" ellipsis={false}>
          You do not have permission to access this page
        </Heading>
        <Text type="text2" color="secondary" element="p" ellipsis={false}>
          Please contact admin for approval.
        </Text>
        <div className="gate-actions">
          <Button kind="tertiary" onClick={() => void signOut()}>Sign out</Button>
        </div>
      </div>
    </div>
  );
}
