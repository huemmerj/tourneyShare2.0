# TourneyShare — Application Plan

## Overview

TourneyShare is a web application for creating, managing, and sharing sports and gaming tournaments. Organizers can run tournaments in multiple formats, invite participants (with or without accounts), track scores, and share live brackets publicly.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js (App Router) |
| Database & Backend | Supabase (PostgreSQL) |
| Authentication | better-auth |
| UI / Styling | Tailwind CSS + shadcn/ui |

---

## Core Features

### 1. Authentication & Identity

- Standard email/password + OAuth login via better-auth
- **Guest/anonymous participants**: when enabled by the organizer, an invite link can be opened by anyone who registers for that tournament without creating an account — they pick a display name and receive a session token (stored in localStorage/cookie) tied to that tournament only
- If an anonymous guest closes the browser and reopens the invite link, they can **reclaim their slot** using the stored token
- Anonymous guests have no access to any other part of the platform

---

### 2. Tournament Creation

The organizer configures the following at creation time:

- Name, description, sport/game type
- **Format**: Single Elimination, Double Elimination, Round Robin, or Swiss
- **Participant type**: Solo (individuals) or Team (groups of users)
- Max participants / max team size
- Start and end dates
- **Visibility**: Public (discoverable) or Private (link-only)
- Shareable invite link with optional **anonymous join** toggle
- Score reporting permissions (per round — see §5)
- Dispute/confirmation flow toggle (see §6)

---

### 3. Participant & Team Management

**Solo tournaments:**
- Users join via invite link or public discovery
- Anonymous guests can join if the organizer enables it
- Organizer can require confirmation before a registration is accepted

**Team tournaments:**
- A user creates a team and invites others to join it
- The team creator is implicitly the captain (for display purposes only — no formal role system)
- Organizer sees each team and its full member list
- Anonymous guests can join a team if anonymous join is enabled

---

### 4. Bracket & Schedule Generation

Matches are auto-generated once the organizer locks registrations. Supported formats:

| Format | Behavior |
|---|---|
| **Single Elimination** | Losers are out immediately. One path to the final. Byes are auto-generated for non-power-of-2 fields. |
| **Double Elimination** | Winners bracket + Losers bracket. First grand final game is decisive (no bracket reset). |
| **Round Robin** | Every participant plays every other. Points-based standings (Win / Draw / Loss). Pools/groups supported for large fields. |
| **Swiss** | Fixed number of rounds. Each round pairings are based on current standings. No early elimination. |

- Ties (equal scores) are not possible by design — the scoring format used for each tournament must produce a decisive result
- Organizer can set scheduled times for individual matches after generation

---

### 5. Score Reporting

Per round, the organizer configures **who may submit a score**:

| Option | Behavior |
|---|---|
| **Organizer only** | Only the tournament creator can submit results |
| **Any participant** | Either participant in the match can submit |
| **Specific users** | Organizer selects a list of trusted reporters |

Scores are a **simple integer pair** per match (e.g. `3 – 1`).

---

### 6. Dispute & Confirmation Flow *(optional per tournament)*

When enabled:

1. First side submits a score
2. Opposing side receives a notification and must **confirm or dispute**
3. **Confirmed** → match is marked complete
4. **Disputed** → match is flagged, organizer is notified and makes the final call

When disabled: the first submission is immediately accepted and the match is marked complete.

---

### 7. Tournament Sharing & Spectating

- Every tournament gets a shareable URL (invite code or slug)
- Public tournaments appear in a discovery feed
- Spectators (no login required) can view brackets, scores, and standings in read-only mode
- Organizer can toggle whether results/standings are visible before the tournament ends

---

### 8. Notifications

Triggered events that require notification:

- Invitation accepted by a participant
- Match scheduled or upcoming
- Score submitted (awaiting confirmation)
- Dispute raised on a match
- Match result finalized
- Tournament completed

---

## Design Decisions & Constraints

| Decision | Choice |
|---|---|
| Ties | Not possible — tournament scoring format must be decisive |
| Double elimination grand final reset | Not supported — first game is final |
| Team roles | No formal roles; team creator is implicit captain for display only |
| Referee/admin roles | Not in scope |
| Score granularity | Single integer pair per match (no set/game-level sub-scores) |
| Anonymous guest persistence | Token stored in localStorage/cookie; guest can reclaim slot on return |
| Score reporting disputes | Optional toggle per tournament |
| Score reporting permissions | Configurable per round (organizer / all / specific users) |

---

## Development Phases

### Phase 1 — Database Architecture
- Design and finalize PostgreSQL schema
- Create Supabase tables, constraints, RLS policies
- Seed with test data

### Phase 2 — Authentication & User Management
- Integrate better-auth
- Anonymous guest token flow
- User profile pages

### Phase 3 — Tournament CRUD
- Create / edit / delete tournaments
- Registration flow (solo + team)
- Invite link generation

### Phase 4 — Bracket Engine
- Auto-generate matches for all four formats
- Bye handling for single elimination
- Swiss pairing algorithm

### Phase 5 — Score Reporting & Disputes
- Per-round permission system
- Dispute flow
- Match status state machine

### Phase 6 — Public Sharing & Spectating
- Read-only bracket view (no login required)
- Discovery feed for public tournaments

### Phase 7 — Notifications
- In-app notification system
- (Optional) email notifications

### Phase 8 — UI Polish & Testing
- Responsive design
- E2E tests
- Performance & security audit
