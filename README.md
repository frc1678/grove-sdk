# @frc1678/grove-sdk

Everything a Citrus Circuits **Grove app** needs to plug into
[the Grove](https://github.com/frc1678/grove): sign-in, the caller's identity
from the Grove's token, a read-only mirror of the roster, the group
vocabulary, and the house style. Start a new app from the
[template](https://github.com/frc1678/grove-app-template); this package is
what it's built on.

```sh
bun add github:frc1678/grove-sdk
```

Ships as TypeScript source (`src/`), bundled by the app's Vite and Convex
builds. Peer dependencies: `convex`, `@convex-dev/auth`, `react`,
`react-dom`.

## `@frc1678/grove-sdk/server` — inside `convex/`

| Export | What |
| --- | --- |
| `groveAuthConfig()` | `convex/auth.config.ts`: trust the Grove's tokens (`GROVE_SITE_URL`, comma-separated for several Groves) |
| `groveUser(ctx)` | The caller from the token claims, or `null` |
| `requireUser`, `requireActiveUser`, `requireManager`, `requireRole(ctx, "coach")` | Guards that throw; managers are leads, coaches, and admins (Leadership on the roster already arrives as `effectiveRole: "admin"`) |
| `isManager`, `isCoach`, `roleAtLeast`, `userInGroup` | Pure checks on a `GroveUser` |
| `groveRosterTable` | Schema fragment for the `groveRoster` mirror |
| `fetchGroveRoster(year?)`, `applyRosterSnapshot(ctx, snapshot)` | Sync the mirror from `GET /api/v1/roster` (needs `GROVE_APP_KEY`) — see the template's `convex/grove.ts` |
| `rosterForYear`, `rosterEntryById`, `rosterEntryForUser` | Read the mirror |
| `proposeIdentity({ email, suggestedEntryId?, context? })` | Hand an unknown email to the Grove's Admin → Identities queue |
| `tutorialViewsTable` | Schema fragment for the `tutorialViews` table |
| `tutorialSeenVersion(ctx)`, `recordTutorialView(ctx, version)` | What `<GroveTutorial>` reads and writes — see the template's `convex/tutorial.ts` |
| `PRIMARY_SUBTEAMS`, `ADDITIONAL_GROUPS`, `ROLE_GROUPS`, `ALL_GROUPS`, `entryInGroup`, `matchSubteamValue` | The Grove's group vocabulary |
| `seasonYearForDate` | FRC season year (fall starts the next year) |
| `googleAccessToken(scopes)`, `slackApi`, `sendSlackDm` | Google service-account and Slack helpers, reading the app deployment's own env vars |
| `findBestMatch`, `scoreMatch`, `normalizeName` | The identity fuzzy-matcher the Grove uses |

Every function derives the caller from the token; never accept a user id as
an argument for authorization. People are referenced by Grove user id or
roster entry id (strings).

## `@frc1678/grove-sdk/react` — in the frontend

```tsx
<GroveProvider groveUrl={VITE_GROVE_CONVEX_URL} appUrl={VITE_CONVEX_URL} appName="Chime">
  <RequireSignedIn>
    <GroveShell nav={[{ href: "/chime/", label: "Events" }]}>…</GroveShell>
  </RequireSignedIn>
</GroveProvider>
```

| Export | What |
| --- | --- |
| `GroveProvider` | Wires the Grove's Convex client (sign-in, session) and the app's own client, handing the Grove's token to the latter |
| `RequireSignedIn` | Redirects signed-out visitors to the Grove's `/sign-in?next=` (a local form in dev), waits for the app backend to accept the token, shows pending/archived accounts a holding page. Once that backend has accepted the token, children stay mounted through a brief unauthenticated blip such as a JWT rotation; it only reports a problem if that lasts `AUTH_PROBLEM_DELAY_MS` (3 s) |
| `useMe()` | The Grove account (`users.me`) |
| `useGrove()` | Both clients, auth state, `signIn`, `signOut` |
| `useGroveQuery(groveApi.roster.list, { year })` | Live Grove queries from the browser |
| `GroveShell`, `PendingScreen`, `Spinner`, `DevSignIn` | House chrome |
| `GroveTutorial`, `TutorialSlide` | The first-run tutorial (below) |

`@frc1678/grove-sdk/groups` exports the group vocabulary for frontends, and
`@frc1678/grove-sdk/theme.css` is the Grove's Tailwind theme (add
`@source "../node_modules/@frc1678/grove-sdk/src";` to your CSS so the SDK's
screens get their classes).

## The first-run tutorial

Every Grove app shows a short tutorial the first time someone opens it. The
slides are the app's; the mechanism is here.

```ts
// convex/schema.ts
tutorialViews: tutorialViewsTable,

// convex/tutorial.ts — thin wrappers, like convex/grove.ts
export const seenVersion = query({ …, handler: (ctx) => tutorialSeenVersion(ctx) })
export const markSeen = mutation({ …, handler: (ctx, a) => recordTutorialView(ctx, a.version) })
```

```tsx
<GroveShell nav={nav}>
  <Outlet />
  <GroveTutorial
    version={TUTORIAL_VERSION}
    slides={slides}
    seenVersion={api.tutorial.seenVersion}
    markSeen={api.tutorial.markSeen}
  />
</GroveShell>
```

It opens itself when the stored version is missing or lower than `version`,
and stays shut otherwise — so bumping `version` is how an app re-shows an
updated tutorial to everyone. Skip and Done both record the version;
someone who skips is not asked twice. Rendered inside `GroveShell`, it also
puts a help button in the header that reopens it; an app that renders no
`<GroveTutorial>` gets no button.

It must sit behind `RequireSignedIn`: both wrapped functions derive the
caller from the token and refuse anyone who isn't active. Slides are text,
icons, and simple diagrams — screenshots go stale the first time the app is
restyled.

## The version badge

Every Grove app shows a `Vxx.yy` version, in the same place in every app, so
that "what version are you on?" has an answer someone can read out across a
loud field. Neither half is typed by hand twice.

`xx` is the app's `TUTORIAL_VERSION`, moved into a file that holds nothing
else:

```ts
// src/version.ts — the whole file
export const APP_MAJOR = 3

// src/tutorial.tsx
export const TUTORIAL_VERSION = APP_MAJOR
```

One number, so a functional change big enough to need a new tutorial slide
also moves the version people see, and bumping it still re-shows the
tutorial to everyone who dismissed the old one.

`yy` is the number of commits on `main` since `src/version.ts` last changed.
Because that file holds only the major, "the last commit that touched it" is
exactly "the last time the major moved" — there is no diff to parse and no
counter to remember, and a merge that changes nothing else still moves the
version.

```ts
// vite.config.ts
import { groveVersionDefine } from "@frc1678/grove-sdk/build"
import { APP_MAJOR } from "./src/version"

export default defineConfig({
  define: groveVersionDefine({ major: APP_MAJOR }),
})
```

```ts
// src/app-version.ts — reads what vite injected
declare const __GROVE_APP_VERSION__: string
export const APP_VERSION = __GROVE_APP_VERSION__
```

```tsx
<GroveShell nav={nav} version={APP_VERSION}>   // or, with your own header:
<GroveVersionBadge version={APP_VERSION} />
```

Keep `src/version.ts` free of anything but the constant: `vite.config.ts`
imports it at config time, where a browser global would not exist.

**A shallow clone cannot compute the minor.** `actions/checkout` fetches
depth 1 by default, and in that repository every count is 0, so every build
would call itself `Vxx.00` and look perfectly healthy. Any workflow that
runs `bun run build` needs `fetch-depth: 0`; `resolveGroveVersion` prints a
warning when it finds itself in a shallow clone rather than letting the
label lie quietly.

## How trust works

The Grove signs its JWTs and publishes the public key at
`<GROVE_SITE_URL>/.well-known/jwks.json`, with a `kid` on both. App
deployments verify with Convex's `customJwt` provider — the OpenID form
validates too but drops the custom claims (role, status, roster placement)
that this whole contract rides on.

## Developing the SDK

```sh
bun install
bun run typecheck && bun run test
bun link            # then `bun link @frc1678/grove-sdk` in an app to work against local changes
```

Apps pin a commit or tag: `"@frc1678/grove-sdk": "github:frc1678/grove-sdk#v0.1.0"`.
