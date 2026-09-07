import { useMemo } from "react";
import { useQuery } from "../data/DataProvider";
import { useTeamLabels } from "../data/useLookups";
import { TypeaheadSelect } from "./TypeaheadSelect";
import type { TeamId } from "../data/types";

/**
 * Choosing a person — every "assigned to", "owner", "who is doing this" in the app.
 *
 * Amber, 7 September: *"choosing a team or person alphabetical … when you start typing a
 * name it auto selects them. also if you select a team first then it should default to
 * showing other people and their team, and the person should have name, team."*
 *
 * So: one list, alphabetical by name, every name with their team beside it. When the
 * record already has a team (`teamId`), that team's people come first under their team's
 * name and everybody else sits under "Other teams" — the likely answer is at the top
 * without the rest being hidden, because a job in Estimating is still sometimes assigned
 * to somebody in Finance.
 *
 * Reads the profiles itself rather than taking them as a prop: nine screens were each
 * fetching the list and mapping `fullName` into options, and this is the tenth copy
 * becoming the only one. Active people only — a deactivated person is not somebody a job
 * can be handed to, although a job already with them still renders their name (the
 * drawer's read-only branch does that, not this picker).
 */
export function PersonSelect({
  value,
  onChange,
  teamId,
  placeholder = "— nobody —",
  "aria-label": ariaLabel,
  clearable = true,
  className,
  disabled,
  exclude
}: {
  value: string | null;
  onChange: (profileId: string | null) => void;
  /** The record's own team: its members are listed first, under the team's name. */
  teamId?: TeamId | string | null;
  placeholder?: string;
  "aria-label": string;
  clearable?: boolean;
  className?: string;
  disabled?: boolean;
  /** People not to offer — already voted, already holding the role. */
  exclude?: ReadonlySet<string> | string[];
}) {
  const { data: profiles } = useQuery(r => r.listProfiles(), []);
  const { label: teamLabel, labels: teamLabels } = useTeamLabels();

  const options = useMemo(() => {
    const skip = exclude ? new Set(exclude) : null;
    const own = teamId ? teamLabel(teamId) : null;
    return profiles
      .filter(p => p.active && !(skip?.has(p.id)) || p.id === value)
      .map(p => {
        const inTeam = Boolean(teamId && p.teams.includes(teamId as TeamId));
        // Null while the team lookup is in flight, and the sub is simply absent then —
        // never the slug. Same rule as everywhere else a team is named.
        const names = teamLabels(p.teams);
        return {
          value: p.id,
          label: p.fullName,
          sub: names && names.length ? names.join(", ") : null,
          group: teamId ? (inTeam ? (own ?? "This team") : "Other teams") : null
        };
      });
  }, [profiles, teamId, teamLabel, teamLabels, exclude, value]);

  return (
    <TypeaheadSelect
      options={options}
      value={value}
      onChange={onChange}
      placeholder={profiles.length ? placeholder : "Loading people…"}
      aria-label={ariaLabel}
      clearable={clearable}
      className={className}
      disabled={disabled}
      emptyText="Nobody by that name"
    />
  );
}
