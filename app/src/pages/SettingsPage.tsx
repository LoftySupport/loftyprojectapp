import { ButtonGroup, Heading, Text, Toggle } from "@vibe/core";
import { SYSTEM_THEMES, type SystemTheme } from "../theme/loftyTheme";
import { Select, toOptions } from "../components/Select";
import { Token } from "../components/Token";
import "../components/ui.css";

/**
 * Defaults, per event, per channel: [in-app, email, Teams].
 *
 * In-app is on for everything — it costs nothing and it is where people already are.
 * Email and Teams are off unless the event is genuinely addressed to you: a mention, a
 * change request waiting on you, something that has blocked your work. Turning on the
 * rest by default is how a rollout ends with everyone filtering the app to a folder in
 * week one, which is the same as switching it off.
 */
const EVENTS: [string, boolean, boolean, boolean][] = [
  ["Overdue", true, false, false],
  ["Stalled", true, false, false],
  ["Mentions", true, true, false],
  ["Blocked", true, false, true],
  ["Change requests", true, true, false],
  ["Ownership", true, false, false],
  ["Incoming work", true, false, false]
];

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
          <Locked label="First name" hint="from Entra ID in the real build" token="profiles.first_name" />
          <Locked label="Last name" token="profiles.last_name" />
          <Locked label="Permission" hint="set by an admin, not by you" token="profiles.permission" />
          <Locked label="Teams" hint="you can sit in more than one" token="profiles.teams" />
          <Locked label="Email" token="profiles.email" />
          <Locked label="Job title" token="profiles.job_title" />
        </section>

        <section className="panel">
          <div className="panel-head">
            <Text type="text2" weight="bold">Where you land</Text>
          </div>
          <Row label="Landing page" hint="the page you open on">
            <Select
              aria-label="Landing page"
              options={toOptions(["Dashboard", "Projects", "Jobs", "Reports"])}
              value="Dashboard"
              onChange={() => {}}
            />
          </Row>
          <Row label="Default jobs view">
            <Select
              aria-label="Default jobs view"
              options={toOptions(["Board", "Table", "Gantt", "Calendar"])}
              value="Board"
              onChange={() => {}}
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

        <section className="panel">
          <div className="panel-head">
            <Text type="text2" weight="bold">Notifications</Text>
            <Text type="text3" color="secondary">
              Defaults are deliberately quiet — the fastest way to lose people is a
              notification firehose in week one.
            </Text>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Event</th><th>In-app</th><th>Email</th><th>Teams</th></tr>
              </thead>
              <tbody>
                {EVENTS.map(([e, inApp, email, teams]) => (
                  <tr key={e}>
                    <td>{e}</td>
                    <td><Toggle isDefaultSelected={inApp} aria-label={`${e} in-app`} size="small" /></td>
                    <td><Toggle isDefaultSelected={email} aria-label={`${e} by email`} size="small" /></td>
                    <td><Toggle isDefaultSelected={teams} aria-label={`${e} in Teams`} size="small" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
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

function Locked({ label, hint, token }: { label: string; hint?: string; token: string }) {
  return (
    <Row label={label} hint={hint}>
      <Token>{token}</Token>
    </Row>
  );
}
