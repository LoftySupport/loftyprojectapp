import { useState } from "react";
import { ButtonGroup, Heading, Text } from "@vibe/core";
import { useAuth } from "../data/AuthProvider";
import {
  JOBS_VIEWS, LANDING_PAGES, readPrefs, writePrefs,
  type JobsView, type LandingPage, type Prefs
} from "../data/preferences";
import { useTeamLabels } from "../data/useLookups";
import { useRepository } from "../data/DataProvider";
import { SYSTEM_THEMES, type SystemTheme } from "../theme/loftyTheme";
import { Select, toOptions } from "../components/Select";
import { Token } from "../components/Token";
import { NotificationSettings } from "../components/NotificationSettings";
import "../components/ui.css";

/**
 * Your details and preferences. Admin is about other people; this page is about you.
 *
 * Identity is read-only because it comes from the IdP — showing it as an editable field
 * would promise something the app cannot deliver. Everything below it is genuinely
 * yours to set.
 */
export function SettingsPage({
  theme,
  onThemeChange
}: {
  theme: SystemTheme;
  onThemeChange: (t: SystemTheme) => void;
}) {
  const { profile } = useAuth();
  const [prefs, setPrefs] = useState(readPrefs);
  // Written to both: the device answers the next first render, the profile carries it
  // to the next machine. The profile write is fire-and-forget on purpose — a failed
  // sync must not stop the choice applying here, and the next save retries it.
  const repo = useRepository();
  const savePref = (patch: Partial<Prefs>) => {
    setPrefs(writePrefs(patch));
    void repo.saveMyPreferences(patch as Record<string, unknown>).catch(() => {});
  };
  // Names, not the slugs `profiles.teams` stores — see useTeamLabels. `resolved` is
  // what keeps a foreign key off the screen while the lookup is still in flight.
  const { labels: teamLabels, resolved: teamsResolved } = useTeamLabels();

  return (
    <>
      <div className="page-head">
        <Heading type="h2" weight="bold">User settings</Heading>
        <Text type="text2" color="secondary">
          Your details and preferences. Admin is about other people; this page is about you.
        </Text>
      </div>

      {/* `min(320px, 100%)`, not a bare 320px: a track floor wider than the container
          is a floor the grid honours, and the page scrolls sideways on a 320px phone. */}
      <div className="card-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))" }}>
        <section className="panel">
          <div className="panel-head">
            <Text type="text2" weight="bold">Your details</Text>
          </div>
          <Locked label="First name" hint="from Entra ID in the real build"
            token="profiles.first_name" value={profile?.firstName} />
          <Locked label="Last name" token="profiles.last_name" value={profile?.lastName} />
          <Locked label="Permission" hint="set by an admin, not by you"
            token="profiles.permission" value={profile?.permission} />
          {/* Joined, not reduced to one — somebody can sit in several, which is what the
              hint beside this field has been promising all along. */}
          <Locked
            label="Teams"
            hint="you can sit in more than one"
            token="profiles.teams"
            value={profile?.teams.length ? teamLabels(profile.teams)?.join(", ") ?? null : null}
            /* Not known until the names are: without this the row falls through to
               "No team assigned" for anyone whose lookup has not landed yet. */
            known={Boolean(profile) && teamsResolved}
            empty={
              <span className="field-empty">
                No team assigned — ask an administrator to add you to one.
              </span>
            }
          />
          <Locked label="Email" token="profiles.email" value={profile?.email} />
          <Locked label="Job title" token="profiles.job_title" value={profile?.jobTitle} />
        </section>

        <section className="panel">
          <div className="panel-head">
            <Text type="text2" weight="bold">Where you land</Text>
          </div>
          {/* Real since G39, and roaming since 0050 — saved against the profile, so the
              site laptop opens the same app as the office one. This device keeps a copy
              too, because the landing route is decided on the first render and waiting
              on a round trip there would flash the wrong page at somebody. */}
          <Row label="Landing page" hint="the page you open on — follows you to any machine you sign in on">
            <Select
              aria-label="Landing page"
              options={toOptions([...LANDING_PAGES])}
              value={prefs.landingPage}
              onChange={v => savePref({ landingPage: v as LandingPage })}
            />
          </Row>
          <Row label="Default jobs view" hint="what the Jobs page opens as when the link doesn't say">
            <Select
              aria-label="Default jobs view"
              options={toOptions([...JOBS_VIEWS])}
              value={prefs.defaultJobsView}
              onChange={v => savePref({ defaultJobsView: v as JobsView })}
            />
          </Row>
          <Row label="Theme" hint="Vibe ships light, dark and black">
            <ButtonGroup
              size="small"
              groupAriaLabel="Theme"
              value={theme}
              options={SYSTEM_THEMES.map(t => ({ value: t, text: t[0].toUpperCase() + t.slice(1) }))}
              onSelect={value => onThemeChange(value as SystemTheme)}
            />
          </Row>
        </section>

        <NotificationSettings />
      </div>
    </>
  );
}

function Row({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field-row">
      <div className="field-label">
        <Text type="text2">{label}</Text>
        {hint && <div className="field-hint">{hint}</div>}
      </div>
      <div className="field-control">{children}</div>
    </div>
  );
}

/**
 * A field you can read and cannot change here.
 *
 * `value` is what it says when the app knows the answer, and the token is what it says
 * when it does not. Both, rather than one or the other: every field on this page comes
 * from `profiles`, which is wired — so showing {{profiles.email}} to somebody looking at
 * their own settings was the template reporting a gap that had closed. The token stays
 * for the case it was built for, which here means a profile that has not loaded, or a
 * column genuinely empty like a job title nobody has filled in.
 */
function Locked({
  label,
  hint,
  token,
  value,
  known,
  empty
}: {
  label: string;
  hint?: string;
  token: string;
  value?: string | null;
  /** Whether the row this reads from has loaded. Without it an empty value during the
   *  first paint would flash "nothing assigned" at somebody who has plenty. */
  known?: boolean;
  empty?: React.ReactNode;
}) {
  return (
    <Row label={label} hint={hint}>
      {value
        ? <Text type="text2">{value}</Text>
        : known && empty
          ? empty
          : <Token>{token}</Token>}
    </Row>
  );
}
