// Fuzzy matching of external accounts (GitHub / Slack / Onshape) to roster
// entries by email, display name, and account handle. Pure and unit-testable.

export type ExternalMember = {
  externalId: string;
  handle?: string;
  name?: string;
  email?: string;
};

export type MatchCandidate = {
  name: string;
  email: string;
};

export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameTokens(value: string): string[] {
  return normalizeName(value).split(" ").filter((token) => token.length > 1);
}

// Score how likely an external member is this roster person.
//   100 exact email
//    90 exact normalized display name
//    85 handle is the full name concatenated (blake-tyson / BlakeTyson)
//    80 every roster-name token appears in the member's display name
//    70 handle looks like first-initial + last name (btyson) or contains
//       the last name plus the first initial somewhere
//     0 otherwise
export function scoreMatch(
  candidate: MatchCandidate,
  member: ExternalMember,
): number {
  const email = member.email?.toLowerCase().trim();
  if (email !== undefined && email !== "" && email === candidate.email) {
    return 100;
  }
  const candidateNorm = normalizeName(candidate.name);
  const tokens = nameTokens(candidate.name);
  if (member.name !== undefined && normalizeName(member.name) === candidateNorm && candidateNorm !== "") {
    return 90;
  }
  const handleNorm = (member.handle ?? member.externalId)
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  if (tokens.length >= 2) {
    const concat = tokens.join("");
    const reversed = [...tokens].reverse().join("");
    if (handleNorm === concat || handleNorm === reversed) {
      return 85;
    }
  }
  if (member.name !== undefined && tokens.length >= 2) {
    const memberNorm = ` ${normalizeName(member.name)} `;
    if (tokens.every((token) => memberNorm.includes(` ${token} `))) {
      return 80;
    }
  }
  if (tokens.length >= 2) {
    const first = tokens[0];
    const last = tokens[tokens.length - 1];
    if (
      handleNorm === `${first[0]}${last}` ||
      handleNorm === `${last}${first[0]}` ||
      (handleNorm.includes(last) && handleNorm.includes(first[0] + last) === false && handleNorm.startsWith(first[0]))
    ) {
      return 70;
    }
    if (handleNorm.includes(last) && last.length >= 4) {
      return 60;
    }
  }
  return 0;
}

export type BestMatch<T> = {
  candidate: T;
  score: number;
  // True when no other candidate scored within 10 points of the winner —
  // an ambiguous winner must not be auto-assigned.
  unique: boolean;
};

export function findBestMatch<T extends MatchCandidate>(
  candidates: T[],
  member: ExternalMember,
): BestMatch<T> | null {
  let best: T | null = null;
  let bestScore = 0;
  let runnerUp = 0;
  for (const candidate of candidates) {
    const score = scoreMatch(candidate, member);
    if (score > bestScore) {
      runnerUp = bestScore;
      bestScore = score;
      best = candidate;
    } else if (score > runnerUp) {
      runnerUp = score;
    }
  }
  if (best === null || bestScore === 0) {
    return null;
  }
  return { candidate: best, score: bestScore, unique: bestScore - runnerUp >= 10 };
}

// Auto-assign only confident, unambiguous matches; anything weaker becomes a
// suggestion for the admin review queue.
export const AUTO_ASSIGN_SCORE = 80;
export const SUGGEST_SCORE = 50;
