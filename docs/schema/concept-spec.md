# Lofty Central Data Architecture — Concept Spec

**A single source of truth for job data, governed by Microsoft 365 identity, connectable to external tools via MCP/API**

*Prepared by AI & Automation with Amber | 17 July 2026 | Working draft v2*

This spec builds directly on the *Software & Process Discovery Report* (9 July 2026). It should be read as the medium-term consolidation step that report already flagged, not a new, unrelated software decision.

**v2 change:** the platform requirement has been relaxed from "must stay inside Microsoft 365" to "must be governed by SharePoint/Teams (Entra ID) for access and authentication, must support external connections via MCP or API, must be extractable/reportable, and must be backed up." This opens the platform decision considerably. See the revised recommendation in the appendix.

---

## Context

The discovery report found no single source of truth across Lofty's 59 tools, with Excel, Trello, SiteBook, SharePoint and email each holding partial, disconnected job information. It recommended two things in sequence:

1. **Immediate**: a job oversight board built in existing tools (SharePoint or Trello), with a "one team at a time" rule.
2. **Medium-term (2–6 months)**: confirm key data points, then consolidate and connect core data to a chosen tool for a single source of truth.

This spec is that medium-term step. It proposes a central data platform underneath the job oversight board, not a replacement for SharePoint or Trello.

## A tension worth naming up front

The discovery report is explicit: *"Lofty does not need to jump straight into another software decision"* and *"the source of truth exists on a macro level of a single data property... not a single software platform to hold all data."*

Read literally, adding a new central platform could look like exactly the move the report warned against. The way to reconcile this: whichever platform is chosen should sit as invisible plumbing, not a fourth app for teams to check. Nobody at Lofty logs into it directly. Teams keep working in SharePoint and Trello, the tools they already know. The platform's job is to hold the canonical value for a small number of key data points (job number, job status, current stage owner) and keep SharePoint and Trello in sync with each other through that shared record.

**Your stated requirements for that platform, confirmed 17 July 2026:**

1. Access and authentication governed by SharePoint/Teams (Microsoft Entra ID).
2. Able to connect to external data sources via MCP or API, as approved.
3. Data must be extractable and reportable.
4. Data must be backed up.

Notably, this doesn't require the platform to live inside the Microsoft 365 tenant, only that Entra ID governs who can get in, and that it plays well with API/MCP-based tooling. That changes the comparison meaningfully from the "everything stays in Microsoft 365" framing in v1 of this spec. See the appendix for the revised comparison.

## Goals

- Give leadership and project teams one place to see where every job is at, without waiting for the next status meeting.
- Eliminate duplicate entry of the same job data across SharePoint and Trello.
- Enforce a "one team at a time" ownership rule on jobs, visible to everyone.
- Reduce the manual handovers the report flagged (contract downloads, deposit emails, drawing notifications) by triggering them from a status change rather than a person noticing one.
- Keep working inside tools staff already know. No retraining on a new interface for day-to-day work.

## Non-goals (this phase)

- **Replacing SharePoint or Trello as the working interface.** Teams keep their existing boards and sites; the central platform is not a new app for staff to learn.
- **Consolidating all 59 tools.** This spec covers job status and ownership data only. The broader software review (Excel, SiteBook, Asana) is a separate short-term workstream from the discovery report.
- **Active AI features in this phase.** Claude and ChatGPT are listed as connected/considered in the software inventory. MCP connectivity is a foundational requirement for this build (per your update), but functional AI features on top of it (natural-language querying, auto-reporting) are a deliberate follow-on phase, not part of this build.
- **Migrating historical Trello or SharePoint data.** Scope is live job data going forward, not backfilling history.
- **Full real-time bidirectional sync as the v1 build.** See Requirements below for why this is phased rather than shipped in one step.

## User stories

**Leadership / overview**
- As a Lofty leader, I want to see every active job's current status and owning team in one view, so I don't have to wait for a weekly meeting to know where something stands.
- As a Lofty leader, I want to see when a job has sat with one team past an expected timeframe, so I can intervene before it becomes a holding cost.

**Project teams (design, marketing, land development, estimating/selections, construction)**
- As a team member, I want to update a job's status once, in the tool I already use, and have it reflected everywhere else, so I don't have to enter the same update twice.
- As a team member, I want to see who currently owns a job before I touch it, so I don't duplicate work another team has already started.
- As a team member, I want a clear signal when a job is handed to my team, so I'm not relying on an email or a meeting to find out.

## Requirements

You flagged two-way sync (edit anywhere, updates everywhere) as the target state. That's the right end state, but shipping full bidirectional sync across three systems in one go is the highest-risk, highest-maintenance version of this build; conflict handling (what happens when SharePoint and Trello both change the same job within minutes of each other) is genuinely hard to get right and easy to get wrong quietly. Recommending a phased build below rather than cutting straight to P0 = full two-way sync.

### Must-have (P0)
- The chosen platform holds one canonical record per job (job number, status, owning team, key dates).
- SharePoint job oversight board reads from the platform and reflects current status and owner.
- Trello card status changes push to the platform (one direction: Trello → platform → SharePoint).
- Access to the platform is authenticated through Microsoft Entra ID, matching your access/auth requirement.
- "One team at a time" ownership is enforced: a job can only be marked as owned by one team/stage at a time.
- Job number is the consistent identifier across systems, resolving the naming inconsistency the discovery report flagged (job number vs address vs board/card/folder).
- The platform exposes an MCP server or documented API so approved external tools (including Claude) can query it directly.
- Automated backups are configured and verified from day one, not added later.

*Acceptance criteria:*
- [ ] Given a Trello card moves to a new list, when the webhook fires, then the platform's job record updates within an agreed time window (e.g. under 5 minutes).
- [ ] Given the platform's job record updates, when the SharePoint oversight board next refreshes, then it shows the new status and owner without manual entry.
- [ ] Given a job is owned by Team A, when Team B attempts to claim it, then the system flags the conflict rather than silently overwriting.
- [ ] Given a user without valid Entra ID credentials, when they attempt to access the platform, then access is denied.

### Nice-to-have (P1)
- Scoped write-back: SharePoint can update a small set of fields (e.g. marking a job "on hold") that push back to the source Trello card.
- Automated notification (Teams message or email) when a job's ownership changes, replacing the manual "waiting for the meeting" pattern.
- A basic staleness flag: jobs untouched for longer than X days surface visually on the oversight board.
- A reporting layer (Power BI or equivalent) reading directly from the platform for leadership dashboards.

### Future considerations (P2)
- Full bidirectional real-time sync across SharePoint, Trello and the platform, with conflict resolution rules.
- Extending the canonical record model to SiteBook once its end-to-end adoption is further along (per the discovery report's finding that SiteBook isn't yet used end-to-end).
- Claude or ChatGPT querying the job data directly via MCP for natural-language status reporting. The connectivity is a P0 foundation; the AI feature itself is deliberately excluded from this phase per your original answer that AI tools have no active role yet.

## Success metrics

**Leading indicators (weeks)**
- Reduction in manual status-check messages in Teams/email per job, measured against a baseline week.
- Percentage of active jobs with a job number that resolves consistently across SharePoint and Trello.
- Adoption: percentage of teams actively updating status through the synced flow rather than a side spreadsheet, 30 days post-launch.

**Lagging indicators (months)**
- Reduction in "holding cost" delays the discovery report attributed to waiting for weekly meetings.
- Reduction in rework linked to two teams working the same job simultaneously.

## Open questions

- **Lofty leadership**: does the access/auth requirement mean identity federation only (users log in via Entra ID), or does it mean full tenant-native governance (Conditional Access policies, Data Loss Prevention, Microsoft Purview compliance reaching the data platform itself)? This is now the single biggest factor in the platform decision. See appendix.
- **IT/Amber**: the software inventory lists Supabase as already active under IT ("Database; AI Platform"). What is it currently used for, and is there spare capacity or a conflict with using it as this system's backend?
- **Lofty leadership**: the discovery report flagged an open-vs-closed governance decision for short-term (2–8 weeks). This spec assumes an open model (teams keep their tools, governance sits underneath). Confirm that's still the direction before committing to this architecture.
- **IT**: what's the approval process for a new integration, MCP connection, or middleware tool? "As approved" in your requirements implies a sign-off step, worth mapping now rather than discovering mid-build.
- **Amber/Lofty**: which 2–3 data points beyond job status and owner are the highest-value to consolidate first? The report calls for confirming key data points before connecting anything; this spec assumes status and ownership, but that should be validated, not assumed.
- **Budget**: is there budget for a Supabase Pro-tier subscription (SSO and backups require Pro and above), or does licensing already held for Dataverse (Power Apps Premium) make that route cheaper in practice?
- **IT**: does anyone at Lofty already hold Power Apps Premium or Dynamics 365 licensing? If not, get a per-user cost before comparing it against Supabase's Pro tier.

## Timeline considerations

This sits in the discovery report's medium-term window (2–6 months), after the immediate job oversight board and the short-term software review are underway. Building this before the short-term "consolidate Trello boards" and open/closed governance decision risks connecting a system that gets restructured underneath it within weeks. Recommend sequencing:

1. Immediate: confirm the job oversight board is live in SharePoint or Trello per the original report (if not already done).
2. Short-term: Trello board consolidation and the open/closed governance decision (both already scoped in the discovery report).
3. This spec: build the connective layer once 1 and 2 are settled, so the sync target is stable.

---

## Appendix: technical feasibility

Neither SharePoint nor Trello has a native, first-party connector to Supabase or Dataverse. Both are reachable via API and webhook, and both are commonly bridged through workflow automation platforms. Integration options, roughly in order of setup effort:

| Approach | How it works | Fit for Lofty |
|---|---|---|
| **Native platform functions/APIs** (Supabase Edge Functions, or Power Automate/Dataverse plugins) | Custom functions call the Microsoft Graph API (SharePoint) and Trello's REST API/webhooks directly. No third-party middleware. | Most control, no extra subscription, but needs ongoing dev maintenance. Best fit if this becomes a proper build rather than a quick proof of concept. |
| **n8n** | Self-hosted or cloud workflow tool with existing SharePoint, Supabase and Dataverse nodes, plus Trello webhook support. | Good middle ground: visible workflows non-developers can audit, lower build time than custom code. Self-hosting keeps data inside infrastructure you control. |
| **Pipedream / Relay.app / Make** | Hosted automation platforms with pre-built connectors for Supabase, SharePoint and Trello. | Fastest to stand up. Data transits a third-party cloud service, which the discovery report flagged as an operational risk under Finding 7. Needs an explicit IT sign-off given the "as approved" requirement. |

**Trello →  platform**: Trello supports webhooks natively (fires on card/board changes). A webhook receiver, whether a platform function or a middleware tool, listens for card moves and writes to the canonical record.

**SharePoint ↔ platform**: no native webhook equivalent; typically polled via the Microsoft Graph API on a schedule, or triggered through Power Automate as the connective step, which then calls out to the platform.

### Revised platform comparison, scored against your four requirements

| Requirement | Supabase | Microsoft Dataverse | Microsoft Fabric | SharePoint Lists |
|---|---|---|---|---|
| **Entra ID governs access/auth** | Yes. SAML 2.0 SSO for the Supabase org (Pro plan and above), plus native Microsoft/Azure OAuth login for end users. Login is federated through Entra ID; day-to-day platform administration still sits in Supabase's own control plane. | Yes, and deepest integration available: native to the Microsoft tenant, reachable by Conditional Access, Data Loss Prevention policies and Microsoft Purview compliance tooling. | Yes, native Azure/Entra tenant integration. | Yes, native. |
| **Connects via MCP/API as approved** | Yes. Supabase ships an official MCP server (32 tools covering the database, schema, Edge Functions and logs), is now a listed official Claude connector, and has a hosted remote MCP server for ChatGPT and other agents too. Edge Functions can call any external API. | Yes. Microsoft shipped a Dataverse MCP server through 2025–2026, natively supported in Copilot Studio and Azure AI Foundry, with a plugin now available for Claude, Cursor and GitHub Copilot specifically. | Partial. Data Factory handles pipeline-based API integration well; a dedicated MCP server for Fabric is less established than Supabase's or Dataverse's. | Partial. Reachable via Microsoft Graph API; no dedicated MCP server identified. |
| **Data extractable/reportable** | Yes. Standard Postgres connector into Power BI (Get Data → PostgreSQL), plus pg_dump and SQL Editor CSV export. | Yes. Native Power BI integration and a documented Web API/OData interface. | Yes, this is Fabric's core strength (Data Factory, warehousing, Power BI all built in). | Limited. Power BI connects, but flat list structure caps reporting depth. |
| **Backed up** | Yes. Built-in daily backups from Pro plan up, point-in-time recovery on higher tiers, pg_dump for manual exports. | Yes. Microsoft-managed backups included as part of the platform. | Yes. Microsoft-managed. | Yes, under standard Microsoft 365 retention, but only as basic list data. |

**All four of your stated requirements are genuinely met by both Supabase and Dataverse.** This is no longer primarily a feasibility question, it's a trade-off between four things that don't show up in the checklist above:

- **Governance depth.** Dataverse sits fully inside Microsoft's own security perimeter, so Conditional Access, DLP and Purview policies apply to the data itself, not just the login. Supabase's SSO federates *who can log in*, but the underlying data plane is governed by Supabase's own controls, not Microsoft's. If "governed by SharePoint/Teams" means the latter, Dataverse is the stronger answer; if it means the former, both qualify.
- **Cost and licensing.** Supabase's Pro tier (required for SSO and full backups) is a flat, predictable monthly cost. Dataverse requires a Power Apps Premium licence per user (or a Dynamics 365 attach licence), which is a real, ongoing cost to confirm per the open question above, and scales with headcount rather than staying flat.
- **Portability and lock-in.** Supabase is standard Postgres underneath. Data can be exported or migrated with common tooling at any point. Dataverse's data model is tied to the Power Platform; moving off it later is a bigger undertaking.
- **Build speed and existing familiarity.** Supabase is already in AI & Automation's own build stack, and is already listed as active in Lofty's software inventory under IT, meaning there's a head start on both tooling familiarity and existing infrastructure. Dataverse would be a new platform to stand up from scratch, on top of confirming licensing.

**Recommendation:** on the four requirements as stated, this is close to a genuine tie between Supabase and Dataverse; the decision now hinges on the open question above about how deep "governed by SharePoint/Teams" needs to go. If Entra ID login federation is sufficient, Supabase is the faster, cheaper, more portable build, and it already has a head start on infrastructure and MCP tooling. If Lofty's IT function needs Conditional Access, DLP or Purview to reach the data platform itself, Dataverse is the more defensible choice despite the added licensing cost. This is worth a direct conversation with IT before committing either way, it's the one open question that changes the recommendation outright.

Sources: [Set up SSO with Azure AD (Supabase docs)](https://supabase.com/docs/guides/platform/sso/azure), [SAML 2.0 SSO for projects (Supabase docs)](https://supabase.com/docs/guides/auth/enterprise-sso/auth-sso-saml), [Login with Azure/Microsoft (Supabase docs)](https://supabase.com/docs/guides/auth/social-login/auth-azure), [Supabase MCP Server (Supabase docs)](https://supabase.com/docs/guides/ai-tools/mcp), [Supabase is now an official Claude connector](https://supabase.com/blog/supabase-is-now-an-official-claude-connector), [Announcing the Supabase Remote MCP Server](https://supabase.com/blog/remote-mcp-server), [Dataverse MCP Server: Understanding the New Tool Shape (Microsoft Power Platform Blog)](https://www.microsoft.com/en-us/power-platform/blog/2026/06/08/dataverse-mcp-server-understanding-the-new-tool-shape/), [Connect to Dataverse with MCP (Microsoft Learn)](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/data-platform-mcp), [Dataverse Is Your Agent Data Platform, July 2026 update (Microsoft Power Platform Blog)](https://www.microsoft.com/en-us/power-platform/blog/2026/07/06/dataverse-july2026/), [How to connect Supabase to Power BI](https://dev.to/jenniekibiri/how-to-connect-supabase-to-microsoft-power-bi-50p8), [Microsoft Dataverse explained (Syskit)](https://www.syskit.com/blog/what-is-microsoft-dataverse-and-how-does-it-compare-to-sharepoint-lists-dataverse-for-teams-and-sql).
