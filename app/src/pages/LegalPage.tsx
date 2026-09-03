import { Link } from "react-router-dom";
import { Heading, Text } from "@vibe/core";
import "./LegalPage.css";

/**
 * Privacy Policy and Terms.
 *
 * Public — deliberately outside `RequireAuth`. A policy nobody can read without signing
 * in has not been published, and these are the two pages a person is most likely to want
 * *before* they hand over an account.
 *
 * **The wording is not written.** These pages carry structure and an honest notice, not
 * invented legal text: a plausible-sounding privacy policy that nobody at Lofty approved
 * is worse than a visibly unfinished one, because it reads as a commitment the business
 * has not actually made. The headings are here so the content has somewhere to land.
 */

interface Section {
  heading: string;
  note: string;
}

const PRIVACY: Section[] = [
  { heading: "What we collect", note: "Sign-in identity from Microsoft Entra (name, work email), and the project and job records staff enter." },
  { heading: "How it is used", note: "Running the job pipeline for Lofty staff. The app is internal and has no public users." },
  { heading: "Who it is shared with", note: "Supabase hosts the database and Netlify serves the app. Note any other processors." },
  { heading: "How long it is kept", note: "Retention periods for project records, and what happens to a profile when someone leaves." },
  { heading: "Your rights and who to contact", note: "Access, correction, and the contact point for a request." }
];

const TERMS: Section[] = [
  { heading: "Who may use this", note: "Lofty staff with an account created in the app. Access is granted and removed by Lofty." },
  { heading: "Acceptable use", note: "What the app is for, and what it must not be used for." },
  { heading: "Data accuracy", note: "That records are entered by people and the business decides what is authoritative." },
  { heading: "Availability", note: "No uptime commitment while this is an internal tool, unless one is agreed." },
  { heading: "Changes to these terms", note: "How staff are told when this changes." }
];

export function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
  const isPrivacy = kind === "privacy";
  const sections = isPrivacy ? PRIVACY : TERMS;

  return (
    <main className="legal" role="main">
      <div className="legal-inner">
        <Link to="/" className="legal-home" aria-label="Back to the app">
          <img src="/lofty_logo_orange.png" alt="Lofty" className="legal-logo" />
        </Link>

        <Heading type="h1" weight="bold">
          {isPrivacy ? "Privacy Policy" : "Terms of Use"}
        </Heading>
        <Text type="text2" color="secondary" ellipsis={false}>
          Lofty Hub
        </Text>

        <div className="legal-pending" role="note">
          <Text type="text2" element="span" ellipsis={false}>
            <strong>Not yet written.</strong> The sections below are the structure this
            page needs. The wording has to come from Lofty rather than be drafted here —
            an unreviewed policy reads as a commitment the business has not made.
          </Text>
        </div>

        {sections.map(s => (
          <section className="legal-section" key={s.heading}>
            <Heading type="h3" weight="bold">{s.heading}</Heading>
            <Text type="text2" color="secondary" ellipsis={false}>{s.note}</Text>
          </section>
        ))}

        <Text type="text3" color="secondary" ellipsis={false}>
          Questions about this page: <a href="https://app.lofty.com.au" target="_blank" rel="noreferrer noopener">Lofty Support</a>.
        </Text>

        <Link to="/" className="legal-back">Back to the app</Link>
      </div>
    </main>
  );
}
