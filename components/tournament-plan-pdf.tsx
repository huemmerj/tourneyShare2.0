"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

type TeamMember = { id: string; display_name: string };

type Team = {
  id: string;
  name: string;
  members: TeamMember[];
};

type Match = {
  id: string;
  round_number: number;
  round_label: string | null;
  match_number: number;
  bracket: "winners" | "losers" | "grand_final";
  participant_a_id: string | null;
  participant_b_id: string | null;
  status: string;
};

type ParticipantWithName = {
  id: string;
  team_id: string | null;
  user?: { name: string; email: string } | null;
  guest?: { display_name: string } | null;
  team?: { name: string } | null;
  display_name?: string | null;
  teamMembers?: TeamMember[];
};

type Tournament = {
  name: string;
  description: string | null;
  sport_type: string | null;
  format: string;
  start_date: string | null;
  end_date: string | null;
};

function getParticipantName(
  participantId: string | null,
  participantsMap: Map<string, ParticipantWithName>,
  fallback: string,
): string {
  if (!participantId) return fallback;
  const p = participantsMap.get(participantId);
  if (!p) return fallback;
  if (p.team) return p.team.name;
  if (p.guest) return p.guest.display_name;
  if (p.user) return p.user.name || p.user.email;
  return p.display_name ?? fallback;
}

export function TournamentPlanPDF({
  tournament,
  matches,
  participants,
  teams,
  labels,
  locale = "en",
}: {
  tournament: Tournament;
  matches: Match[];
  participants: ParticipantWithName[];
  teams: Team[];
  labels: {
    pdf_button: string;
    teams_title: string;
    matches_title: string;
    round: string;
    vs: string;
    members: string;
    no_members: string;
    format: string;
    dates: string;
    tbd: string;
    bye: string;
    generated: string;
    page: string;
    of: string;
    losers_round: string;
    filename_suffix: string;
  };
  locale?: string;
}) {
  const [generating, setGenerating] = useState(false);

  async function generatePDF() {
    setGenerating(true);
    try {
      const { jsPDF: JsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");

      const doc = new JsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      const contentWidth = pageWidth - margin * 2;
      let y = margin;

      const pMap = new Map(participants.map((p) => [p.id, p]));
      const dateLocale = locale === "de" ? "de-DE" : "en-US";

      // --- Header ---
      doc.setFillColor(41, 98, 255);
      doc.rect(0, 0, pageWidth, 35, "F");

      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text(tournament.name, margin, y + 4);
      y += 12;

      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      const metaParts: string[] = [];
      if (tournament.sport_type) metaParts.push(tournament.sport_type);
      metaParts.push(tournament.format.replace(/_/g, " "));
      if (tournament.start_date) {
        const start = new Date(tournament.start_date).toLocaleDateString(
          dateLocale,
        );
        const end = tournament.end_date
          ? new Date(tournament.end_date).toLocaleDateString(dateLocale)
          : "";
        metaParts.push(end ? `${start} – ${end}` : start);
      }

      doc.text(metaParts.join("  ·  "), margin, y);
      y += 8;

      if (tournament.description) {
        doc.setFontSize(9);
        doc.setTextColor(220, 220, 220);
        const descLines = doc.splitTextToSize(
          tournament.description,
          contentWidth,
        );
        doc.text(descLines, margin, y + 3);
        y += descLines.length * 4 + 4;
      }

      doc.setTextColor(0, 0, 0);
      y = 42;

      // --- Teams section as a 2-column grid ---
      if (teams.length > 0) {
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(41, 98, 255);
        doc.text(labels.teams_title.toUpperCase(), margin, y + 5);
        y += 9;

        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.3);
        doc.line(margin, y, pageWidth - margin, y);
        y += 5; // Added slight padding after the line

        const cardPadding = 3;
        const cardMargin = 4; // Vertical space between rows
        const columnGap = 4; // Horizontal space between columns
        const colWidth = (contentWidth - columnGap) / 2;

        // Iterate through teams in pairs of 2
        for (let i = 0; i < teams.length; i += 2) {
          const team1 = teams[i];
          const team2 = teams[i + 1];

          // Calculate height for both cards and use the max to keep rows uniform
          const h1 =
            team1.members.length > 0 ? 8 + team1.members.length * 5 : 14;
          const h2 =
            team2 && team2.members.length > 0
              ? 8 + team2.members.length * 5
              : team2
                ? 14
                : 0;
          const rowHeight = Math.max(h1, h2);

          // Page break check
          if (y + rowHeight > pageHeight - 20) {
            doc.addPage();
            y = margin;
          }

          // Helper function to draw a single card
          const drawCard = (team: Team, xPos: number) => {
            doc.setFillColor(248, 250, 252);
            doc.setDrawColor(220, 220, 220);
            doc.roundedRect(xPos, y, colWidth, rowHeight, 2, 2, "FD");

            doc.setFontSize(11);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(30, 30, 30);
            doc.text(team.name, xPos + cardPadding, y + 5);

            if (team.members.length > 0) {
              doc.setFontSize(8);
              doc.setFont("helvetica", "normal");
              doc.setTextColor(100, 100, 100);
              let memberY = y + 10;
              for (const member of team.members) {
                doc.text(
                  `•  ${member.display_name}`,
                  xPos + cardPadding + 2,
                  memberY,
                );
                memberY += 5;
              }
            } else {
              doc.setFontSize(8);
              doc.setFont("helvetica", "italic");
              doc.setTextColor(150, 150, 150);
              doc.text(labels.no_members, xPos + cardPadding + 2, y + 10);
            }
          };

          // Draw first column
          drawCard(team1, margin);

          // Draw second column if the team exists
          if (team2) {
            drawCard(team2, margin + colWidth + columnGap);
          }

          y += rowHeight + cardMargin;
        }

        doc.setTextColor(0, 0, 0);
        y += 2; // Extra padding before the next section
      }

      // --- Matches section as table ---
      if (matches.length > 0) {
        if (y > pageHeight - 60) {
          doc.addPage();
          y = margin;
        }

        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(41, 98, 255);
        doc.text(labels.matches_title.toUpperCase(), margin, y + 5);
        y += 9;

        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.3);
        doc.line(margin, y, pageWidth - margin, y);
        y += 4;

        const bracketOrder = { winners: 0, losers: 1, grand_final: 2 };
        const bracketLabels: Record<string, string> = {
          winners: "",
          losers: labels.losers_round,
          grand_final: labels.round + " · ",
        };

        const sorted = [...matches].sort((a, b) => {
          const d =
            (bracketOrder[a.bracket] ?? 0) - (bracketOrder[b.bracket] ?? 0);
          if (d !== 0) return d;
          return (
            a.round_number - b.round_number || a.match_number - b.match_number
          );
        });

        type RoundGroup = {
          bracket: string;
          round: number;
          label: string;
          matches: Match[];
        };
        const groups: RoundGroup[] = [];
        for (const m of sorted) {
          let group = groups.find(
            (g) => g.bracket === m.bracket && g.round === m.round_number,
          );
          if (!group) {
            group = {
              bracket: m.bracket,
              round: m.round_number,
              label:
                m.bracket === "grand_final"
                  ? labels.round + " · Grand Final"
                  : `${bracketLabels[m.bracket] ?? ""}${m.round_label ?? `${labels.round} ${m.round_number}`}`,
              matches: [],
            };
            groups.push(group);
          }
          group.matches.push(m);
        }

        const tableHeader: string[][] = [["#", labels.round, ""]];
        const tableBody: any[] = [];
        let lastBracket = "";

        for (const group of groups) {
          if (group.bracket !== lastBracket) {
            lastBracket = group.bracket;
          }

          tableBody.push([
            {
              content: group.label,
              colSpan: 3,
              styles: {
                fontStyle: "bold",
                fontSize: 10,
                textColor: [41, 98, 255],
                fillColor: [240, 244, 255],
                halign: "left",
                cellPadding: { top: 4, bottom: 3, left: 2, right: 2 },
              },
            },
          ]);

          for (const m of group.matches) {
            const nameA = getParticipantName(
              m.participant_a_id,
              pMap,
              labels.tbd,
            );
            const nameB =
              m.status === "bye"
                ? labels.bye
                : getParticipantName(m.participant_b_id, pMap, labels.tbd);
            const matchNum = `${m.match_number}.`;

            if (m.status === "bye") {
              tableBody.push([matchNum, nameA, labels.bye]);
            } else {
              tableBody.push([matchNum, nameA, `vs. ${nameB}`]);
            }
          }
        }

        autoTable(doc, {
          startY: y,
          margin: { left: margin, right: margin },
          head: tableHeader,
          body: tableBody,
          theme: "grid",
          headStyles: {
            fillColor: [41, 98, 255],
            textColor: [255, 255, 255],
            fontStyle: "bold",
            fontSize: 9,
            cellPadding: 3,
          },
          styles: {
            fontSize: 9,
            cellPadding: 2.5,
            textColor: [30, 30, 30],
            lineColor: [220, 220, 220],
            lineWidth: 0.2,
          },
          alternateRowStyles: {
            fillColor: [250, 252, 255],
          },
          columnStyles: {
            0: { cellWidth: 12, fontStyle: "bold", halign: "center" },
            1: { cellWidth: "auto" },
            2: { cellWidth: "auto", textColor: [80, 80, 80] },
          },
        });
      }

      // --- Footer on every page ---
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(150, 150, 150);
        doc.text(
          `${labels.generated} ${new Date().toLocaleDateString(dateLocale)}`,
          margin,
          pageHeight - 8,
        );
        doc.text(
          `${labels.page} ${i} ${labels.of} ${totalPages}`,
          pageWidth - margin,
          pageHeight - 8,
          { align: "right" },
        );
      }

      // Download
      const safeName = tournament.name
        .replace(/[^a-zA-Z0-9äöüÄÖÜß _-]/g, "")
        .replace(/\s+/g, "_");
      const suffix = labels.filename_suffix || "_TournamentPlan";
      doc.save(`${safeName}${suffix}.pdf`);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={generatePDF}
      disabled={generating}
    >
      <Download className="mr-1.5 h-4 w-4" />
      {generating ? "…" : labels.pdf_button}
    </Button>
  );
}
