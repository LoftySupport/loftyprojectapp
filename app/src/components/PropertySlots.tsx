import { Text } from "@vibe/core";
import { byStage, slotsFor, type PropertyScope } from "../data/lookups";
import { Token } from "./Token";
import "./ui.css";

/**
 * The field slots.
 *
 * Every property defined in Admin → Properties that does not already have a column of
 * its own, rendered where it will actually live: grouped by the stage that captures it,
 * labelled with the team that captures it, value tokenised to `property_values.value`.
 *
 * There is no fixed number of slots because there is no fixed number of fields —
 * properties are rows. Add a definition and one more appears here, everywhere the scope
 * matches. That is why nothing in this app has a `{{field_1}}`: a count would be a
 * fiction, and a wrong one as soon as the real field lists land.
 *
 * Binding: join `property_values` on (property_def_id, subject_type, subject_id). A slot
 * stops showing its token the moment its row comes back.
 */
export function PropertySlots({ scope }: { scope: PropertyScope }) {
  const groups = byStage(slotsFor(scope));
  if (groups.length === 0) return null;

  const total = groups.reduce((n, g) => n + g.defs.length, 0);

  return (
    <section className="panel" aria-label="Fields captured through the pipeline">
      <div className="panel-head">
        <Text type="text2" weight="bold">Captured through the pipeline</Text>
        <Text type="text3" color="secondary">
          {total} field{total === 1 ? "" : "s"} defined in Admin → Properties
        </Text>
      </div>

      {groups.map(g => (
        <div className="slot-stage" key={g.stage}>
          <div className="slot-stage-head">{g.stage}</div>
          {g.defs.map(d => (
            <div className="slot-row" key={d.key}>
              <div className="slot-label">
                <Text type="text2" weight="medium" element="span">{d.label}</Text>
                {d.required && (
                  <span className="slot-required" title="Required to leave this stage">
                    required
                  </span>
                )}
                <div className="slot-sub">
                  {d.team} · {d.format}
                </div>
              </div>
              <div className="slot-value">
                <Token>property_values.value</Token>
              </div>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
