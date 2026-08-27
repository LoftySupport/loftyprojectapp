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
 * So the copy has one job — say what is true, without implying fault. This person is
 * not locked out, not unrecognised, and nothing has gone wrong: they are early. The
 * difference matters, because the wording next door ("your account is not set up") is
 * the one that reads as a failure, and this project has already lost an hour to it.
 *
 * No menus, no greyed-out screens, no preview of what they cannot have. A gate that
 * shows the app behind it is an invitation to try the handle.
 */
export function DemoGatePage() {
  const { profile, signOut } = useAuth();
  const first = profile?.firstName?.trim();

  return (
    <div className="gate">
      <div className="gate-card">
        <Text type="text3" color="secondary" element="div" ellipsis={false}>Lofty</Text>
        <Heading type="h2" weight="bold">
          {first ? `You're all set up, ${first}` : "You're all set up"}
        </Heading>
        <Text type="text2" color="secondary" element="p" ellipsis={false}>
          Your account is ready and waiting — it just opens when somebody walks you
          through it. Nothing is wrong, and there is nothing for you to fix.
        </Text>
        <Text type="text2" color="secondary" element="p" ellipsis={false}>
          Ask whoever set you up to turn demo mode off for your account when you are
          ready to start, and everything below this screen opens up.
        </Text>
        <div className="gate-actions">
          <Button kind="tertiary" onClick={() => void signOut()}>Sign out</Button>
        </div>
      </div>
    </div>
  );
}
