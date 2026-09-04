// Server side of a Grove app (everything under convex/).
export { groveAuthConfig, type GroveAuthProvider } from "./authConfig";
export {
  groveUser,
  groveUserFromIdentity,
  isCoach,
  isManager,
  MANAGER_ROLES,
  requireActiveUser,
  requireManager,
  requireRole,
  requireUser,
  roleAtLeast,
  ROLES,
  userInGroup,
  type GroveUser,
  type Role,
  type RosterRole,
  type Status,
} from "./identity";
export { optionalEnv, requireEnv } from "./env";
export { seasonYearForDate } from "./season";
export {
  ADDITIONAL_GROUPS,
  ALL_GROUPS,
  entryInGroup,
  LEADERSHIP_GROUP,
  matchSubteamValue,
  OUTREACH_LEADS_GROUP,
  PRIMARY_SUBTEAMS,
  ROLE_GROUPS,
  type SubteamMatch,
} from "./subteams";
export {
  applyRosterSnapshot,
  fetchGroveGroups,
  fetchGroveRoster,
  groveApiHeaders,
  groveRosterTable,
  groveSiteUrl,
  proposeIdentity,
  rosterEntryById,
  rosterEntryForUser,
  rosterForYear,
  rosterRoleValidator,
  type GroupVocabulary,
  type RosterEntry,
  type RosterSnapshot,
} from "./roster";
export {
  recordTutorialView,
  tutorialSeenVersion,
  tutorialViewsTable,
} from "./tutorial";
export { googleAccessToken, base64UrlEncode } from "./google";
export { sendSlackDm, slackApi, slackToken } from "./slack";
export {
  AUTO_ASSIGN_SCORE,
  findBestMatch,
  normalizeName,
  scoreMatch,
  SUGGEST_SCORE,
  type BestMatch,
  type ExternalMember,
  type MatchCandidate,
} from "./identityMatch";
