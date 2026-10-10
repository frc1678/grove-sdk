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
| `rosterForYear`, `rosterEntryById`, `rosterEntryForUser` | Read the mirror. Entries carry `picture` (the person's Slack photo URL) once the app asks for it — below |
| `rosterSnapshotValidator`, `rosterEntryValidator` | The argument validator for an app's `applySnapshot` mutation. Use these instead of listing roster fields by hand: a hand-copied list rejects the whole sync the day a field is added |

**Photos are opt-in per app.** `fetchGroveRoster(year, { include: ["picture"] })`
asks the Grove for each person's photo. Turn it on in the same change that
moves the app's `applySnapshot` to `rosterSnapshotValidator` — an older
hand-written validator has no `picture` and would reject every snapshot.
Without `include` nothing changes, so bumping the SDK alone is safe. The fetch
also keeps only the mirror table's own columns, so a field a newer Grove adds
can't break an older app.
| `proposeIdentity({ email, suggestedEntryId?, context? })` | Hand an unknown email to the Grove's Admin → Identities queue |
| `notifyGroveDeployed({ sha, version? })` | Tell the Grove which commit just went live (`POST /api/v1/deployed`, needs `GROVE_APP_KEY`) — see [Report a problem](#report-a-problem) |
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
<GroveProvider groveUrl={VITE_GROVE_CONVEX_URL} appUrl={VITE_CONVEX_URL} appName="Chime" version={APP_VERSION}>
  <RequireSignedIn>
    <AppLayout />   {/* GroveShell inside, below */}
  </RequireSignedIn>
</GroveProvider>
```

| Export | What |
| --- | --- |
| `GroveProvider` | Wires the Grove's Convex client (sign-in, session) and the app's own client, handing the Grove's token to the latter; also wraps the app in the report provider (below) |
| `RequireSignedIn` | Redirects signed-out visitors to the Grove's `/sign-in?next=` (a local form in dev), waits for the app backend to accept the token, shows pending/archived accounts a holding page. Once that backend has accepted the token, children stay mounted through a brief unauthenticated blip such as a JWT rotation; it only reports a problem if that lasts `AUTH_PROBLEM_DELAY_MS` (3 s) |
| `useMe()` | The Grove account (`users.me`) |
| `useGrove()` | Both clients, auth state, `signIn`, `signOut` |
| `useGroveQuery(groveApi.roster.list, { year })` | Live Grove queries from the browser |
| `GroveShell`, `PageHeader`, `PageTitle` | The app bar every app shares, and a page's title (below) |
| `GroveMenu`, `GroveMenuItem`, `GroveMenuSeparator`, `GroveMenuLabel` | The shell's menus, for an app's own extra menu items |
| `GroveAvatar` | A person's photo, or their initials: `<GroveAvatar name={entry.name} src={entry.picture} size="xl" />`. Sizes `sm` 24px (table rows), `md` 32px, `lg` 40px, `xl` 56px (face grids). Decorative — keep the name beside it |
| `PendingScreen`, `Spinner`, `DevSignIn` | House chrome |
| `GroveTutorial`, `TutorialSlide`, `ChangelogEntry` | The first-run tutorial, the "What's new" note, and the full changelog (below) |
| `ReportProblemButton`, `useReportContext`, `useReportProblem`, `ReportProvider` | Report a problem (below) |

`@frc1678/grove-sdk/groups` exports the group vocabulary for frontends, and
`@frc1678/grove-sdk/theme.css` is the Grove's Tailwind theme (add
`@source "../node_modules/@frc1678/grove-sdk/src";` to your CSS so the SDK's
screens get their classes).

## The app bar

`GroveShell` is the header every Grove app shares, first built in Parts. One
row: the app's mark, name and version on the left; the page's name centred
while the nav is folded away; a menu on the right.

| Width | Header |
| --- | --- |
| below `navFrom` | the page's name in the middle; the menu holds the pages, the tutorial, What's new, Report a problem, Back to the Grove, the theme (Light / Dark / System), and Sign out |
| `navFrom`+ | the pages inline; the menu holds the rest |

There are no other header buttons at any width — one menu, always in the
same place.

```tsx
// src/routes/layout.tsx
const { pathname } = useLocation()

<GroveShell
  icon={<AppIcon />}                 // public/favicon.svg
  version={APP_VERSION}
  nav={[{ to: "/", label: "Events" }, { to: "/display", label: "Display", newTab: true }]}
  pathname={pathname}
  link={Link}                        // React Router's Link: no reloads
  navFrom="lg"                       // where every label fits on one row
  width="6xl"                        // match <main>
  theme={useTheme()}                 // next-themes, as it is
>
  <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 py-3 sm:py-5"><Outlet /></main>
  <GroveTutorial … />
</GroveShell>
```

`actions` keeps an app's own control in the header at every width (an event
switcher, a queue count); `menu` adds `GroveMenuItem`s. A nav item takes
`badge`, `newTab`, and `match` when "this page" is more than a prefix. The
shell sets `--grove-header` (its height, border included) for pages that
fill the viewport: `h-[calc(100dvh-var(--grove-header))]`.

A page names itself with `PageHeader` (or `PageTitle` alone):

```tsx
<PageHeader title="All requests" />
<PageHeader title={part.partNumber} subtitle={`Issued by ${who} on ${date}`} actions={<Button>…</Button>} />
```

The title goes into the app bar while the nav is folded. Once the nav is
inline it is the page's `h1` — unless it only repeats the highlighted tab,
which already says where you are. `subtitle` is a line of facts about this
one thing, at every width. There is no description: a page does not explain
itself in a paragraph above its content; the tutorial does.

## The table toolbar

`TableToolbar` goes over every table or list worth filtering: search, then
Filter, Sort, Group and •••, with what is set as chips (✕ each, Clear all).
Filters take several values; a `custom` field holds the page's own controls
(a date range). Icons and a bottom sheet on a phone, labels and a panel
from 640px. The page keeps its own state — put filters in the URL,
comma-separated — and its own filtering.

```tsx
<TableToolbar
  search={{ value: q, onChange: setQ }}
  filters={[{ key: "status", label: "Status", options, values: status, onChange: setStatus }]}
  sort={{ options: SORTS, value: sort, onChange: setSort, defaultKey: "priority" }}
  group={{ options: GROUPS, value: group, onChange: setGroup, noneKey: "none" }}
  more={<GroveMenuItem onSelect={exportCsv}>Export</GroveMenuItem>}
  count={`${rows.length} of ${all.length} parts`}
  primary={{ label: "New part", onClick: () => setCreating(true) }}
/>
```

## The first-run tutorial, and what's new

Every Grove app shows a short tutorial the first time someone opens it, and
a short "What's new" note — not the tutorial again — to people coming back
after a major version bump. The slides and the changelog are the app's; the
mechanism is here.

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
    changelog={changelog}
    seenVersion={api.tutorial.seenVersion}
    markSeen={api.tutorial.markSeen}
  />
</GroveShell>
```

Which one opens depends on the version the person last dismissed:

| Stored version | Opens |
| --- | --- |
| none — first visit | the tutorial |
| lower than `version` | "What's new": every changelog entry after the stored version, newest first, with a link to the full tutorial |
| lower, but no entry covers the gap | nothing — a bump without an entry is silent rather than a re-run of the tutorial |
| `version` or higher | nothing |

```tsx
// src/changelog.tsx — beside src/tutorial.tsx
export const changelog: ChangelogEntry[] = [
  {
    version: 4, // the APP_MAJOR this shipped in
    title: "Make-up meetings", // optional
    changes: [
      "Missed a required meeting? Make it up from My History.",
      <>Leads can now hand a student the keys for <b>one</b> meeting.</>,
    ],
  },
]
```

Add the entry in the same pull request that bumps `src/version.ts`; an
entry whose version is above the build's is held back until the bump ships.
Write it for someone who already uses the app: what is different, in a
sentence each, not how the app works. Skip, Done, Got it and Escape all
record the version, so nobody is shown the same thing twice. Rendered inside
`GroveShell`, the menu gains "How … works", which reopens the tutorial, and
"What's new", which opens **every** version's entries, newest first, with the
ones this person had not seen marked New. An app that renders no
`<GroveTutorial>` gets neither.

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
also moves the version people see, and bumping it shows everyone who has
used the app before that version's changelog entry.

`yy` is the number of commits on `main` since the commit that last changed
the `export const APP_MAJOR =` line. Git finds that commit itself
(`git log -G`), so there is no counter to remember, a merge that changes
nothing else still moves the version, and editing the file's comment does
not reset anything. (It used to count from any change to the file; one
reworded comment put four apps back to `.00`.)

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
<GroveShell … version={APP_VERSION}>   // or, with your own header:
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

## The home-screen icon

Adding an app to a phone's home screen takes the icon from a PNG
`apple-touch-icon`; iOS ignores SVG there and draws a grey tile with the
title's first letter instead. `groveHomeScreen()` draws those PNGs from the
app's one icon, `public/favicon.svg`, on every build, so there is no second
copy to go stale:

```ts
import { groveHomeScreen } from "@frc1678/grove-sdk/build"

export default defineConfig({
  plugins: [react(), tailwindcss(), groveHomeScreen()],
})
```

It emits `apple-touch-icon.png` (180px), `icon-192.png`, `icon-512.png` and
`manifest.webmanifest` at the root of the build, and adds their links and an
`apple-mobile-web-app-title` to `index.html` under Vite's `base`. The dev
server serves the same files. Each PNG is the favicon at 62.5% on the app
shell's dark background (`#0a0a0a`); the name under the icon is
`package.json`'s `grove.name` unless `{ name }` is passed. The build fails
if `public/` also holds one of those files, since a hand-made copy is
exactly what goes stale.

A phone keeps the icon it saw when the app was added. After an icon change,
remove the app from the home screen and add it again.

## Report a problem

Every Grove app has a **Report a problem** button: a flag icon in the
`GroveShell` header, and **Alt+Shift+R** (Option+Shift+R on a Mac)
anywhere. It opens a sheet with a screenshot of what the person was looking
at, a pen to circle the problem, a line of text, and a Bug / Idea toggle.
The report goes to the Grove, which files it and posts it to Slack.

What a report carries without anyone typing it:

- the app's slug and build (`V03.07`), the full URL, the viewport and DPR,
  the browser, and a device class (phone / tablet / desktop);
- the last 20 `console.error` calls, uncaught errors, and unhandled
  rejections — which include the Convex function errors the client saw,
  because the Convex client logs those through `console.error`;
- the screenshot with the drawing burned in. Visible `<canvas>` elements
  are in it (Sim's field is), except a WebGL canvas without
  `preserveDrawingBuffer`, which reads back blank;
- whatever the app adds with `useReportContext`;
- the reporter, taken by the Grove from the token — never sent by the app.

When the Grove has a Sentry DSN configured, the SDK also loads Sentry (only
then — an app on a Grove without one never downloads it). Errors are
captured with a release of `<slug>@<version>`, and the minute of session
replay before a report or an error is sent with it. Sentry sees the Grove
user id and role, never a name or email. Sending never waits on Sentry
for more than four seconds: a browser that blocks it (an ad blocker, a
school network) still files the report with the Grove, just without the
replay link.

The sheet opens on the press and the screenshot fills in behind it.
Cloning the page for the picture takes time in proportion to the whole
document — a couple of seconds on a phone on a long page — so a page with
thousands of rows makes the picture slow, not the button.

**Wiring.** `GroveProvider` does it all; pass it the version so reports
name their build, even if `GroveShell` already shows it:

```tsx
<GroveProvider groveUrl={…} appUrl={…} appName="Sim" version={APP_VERSION}>
```

The slug defaults to the first segment of Vite's `base` (`"/sim/"` →
`sim`); pass `appSlug` if the app is registered under another one. The
sheet is styled with the theme's classes, so the `@source` line above is
required for it too.

**Your own header.** Apps that don't use `GroveShell` put the button
wherever the header has room; it renders nothing outside `GroveProvider`:

```tsx
<ReportProblemButton />                       // icon-only, like TutorialButton
<ReportProblemButton className="…">Report a problem</ReportProblemButton>
const report = useReportProblem()             // report?.open() from a menu item
```

**App context.** Hand over state that would help someone reproduce the
problem. The function runs when a report opens, not on every render, so it
can be expensive; values from every mounted caller are merged.

```tsx
// Sim: the lobby, the match, and the replay input log, so a fixer can
// re-run the match headlessly and watch the bug happen.
useReportContext(() => ({
  lobbyId,
  matchId,
  replayLog: recorder.log(),
}))
```

The Grove stores the first 20,000 characters of it; Sentry gets it whole.

**The Grove itself** has its own provider tree, so it imports the pieces
from `@frc1678/grove-sdk/report` (`ReportProvider`, `ReportProblemButton`,
`useReportContext`, `useReportProblem`) without `GroveProvider`.

### Telling the Grove what shipped

After each deploy, the app tells the Grove which commit went live, so the
Grove — which holds the Slack token — can mark every report fixed in it as
shipped. Add to `convex/grove.ts`:

```ts
import { notifyGroveDeployed } from "@frc1678/grove-sdk/server"

// Run by deploy.yml after `bun run deploy`.
export const reportDeployed = internalAction({
  args: { sha: v.string(), version: v.optional(v.string()) },
  handler: (_ctx, args) => notifyGroveDeployed(args),
})
```

and to `.github/workflows/deploy.yml`, after the `bun run deploy` step:

```yaml
      - name: Tell the Grove what shipped
        # A notice, not part of the deploy: if the Grove is down, the
        # deploy still succeeded and should say so.
        continue-on-error: true
        run: |
          VERSION=$(bun -e 'import { resolveGroveVersion } from "@frc1678/grove-sdk/build"; import { APP_MAJOR } from "./src/version.ts"; console.log(resolveGroveVersion({ major: APP_MAJOR }).label)')
          bunx convex run grove:reportDeployed "{\"sha\":\"$GITHUB_SHA\",\"version\":\"$VERSION\"}"
        env:
          CONVEX_DEPLOY_KEY: ${{ secrets.CONVEX_DEPLOY_KEY }}
```

The version is computed the same way the build computes the header's, so it
needs the same `fetch-depth: 0` checkout the deploy job already has.

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
