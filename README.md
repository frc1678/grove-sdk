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
| `groveHealthResponse()`, `reportGroveHealth(components)`, `rosterSyncHealth(run)`, `heartbeatHealth(device)` | Grove Health: the public `/<slug>/api/health` route, and the 5-minute report of the app's agents, jobs and keys (`POST /api/v1/health`) — see [Grove Health](#grove-health) |
| `tutorialViewsTable` | Schema fragment for the `tutorialViews` table |
| `tutorialSeenVersion(ctx)`, `recordTutorialView(ctx, version)` | What `<GroveTutorial>` reads and writes — see the template's `convex/tutorial.ts` |
| `PRIMARY_SUBTEAMS`, `ADDITIONAL_GROUPS`, `ROLE_GROUPS`, `ALL_GROUPS`, `entryInGroup`, `matchSubteamValue` | The Grove's group vocabulary |
| `seasonYearForDate` | FRC season year (fall starts the next year) |
| `groveSlack({ name, slug })` | Post to Slack as the app, by the posting rule — see [Slack](#slack) |
| `googleAccessToken(scopes)`, `slackApi`, `sendSlackDm` | Google service-account and raw Slack helpers, reading the app deployment's own env vars (`sendSlackDm` posts as the shared bot) |
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
| `GroveAvatar` | A person's photo, or their initials: `<GroveAvatar name={entry.name} src={entry.picture} size="xl" />`. Sizes `xs` 20px (inside a badge), `sm` 24px (table rows), `md` 32px, `lg` 40px, `xl` 56px (face grids). Decorative — keep the name beside it |
| `PendingScreen`, `Spinner`, `DevSignIn` | House chrome |
| `GroveTutorial`, `TutorialSlide`, `ChangelogEntry` | The first-run tutorial, the "What's new" note, and the full changelog (below) |
| `GroveTutorials`, `defineTutorials`, `practice` | Hands-on tutorials run in tutorial mode, where nothing is saved (below) |
| `ReportProblemButton`, `useReportContext`, `useReportProblem`, `ReportProvider` | Report a problem (below) |

`@frc1678/grove-sdk/groups` exports the group vocabulary for frontends, and
`@frc1678/grove-sdk/theme.css` is the Grove's Tailwind theme (add
`@source "../node_modules/@frc1678/grove-sdk/src";` to your CSS so the SDK's
screens get their classes).

## The app bar

`GroveShell` is the header every Grove app shares, first built in Foundry. One
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

## Tutorials and tutorial mode

Hands-on tutorials: short tasks a person does themselves, in the real app,
over the real data on screen, with **nothing saved**. They are separate from
the first-run tour above, which only points at things. An app offers 2–10,
one per thing people most often come to it to do. The menu grows a
"Tutorials" item; the Grove lists every app's at `/tutorials`, keeps the
points, and counts them toward engagement.

### How nothing gets saved

`GroveProvider` gives the app a `SandboxConvexClient`. Outside a tutorial it
is a plain `ConvexReactClient`. While a tutorial runs, every `useMutation`
and `useAction` call is stopped before it leaves the browser:

- a write the tutorial **practises** runs its *effect* instead: a function
  that says what the write would have changed on screen, by editing query
  results in the browser on top of what the server last sent;
- any **other** write is dropped, resolves `null`, and the person is told it
  was not saved.

Queries keep running, so the page shows live production data with the
practice changes layered over it. Exiting throws the layer away. There is no
fake-data mode and no server code to write: the app's backend is untouched.

Things the sandbox cannot see, and a tutorial must stay away from: a raw
`fetch` to an HTTP action, a file upload to a storage URL, `window.open`,
and anything written through the **Grove's** client (Report a problem really
does file a report). A blocked `generateUploadUrl` returns `null`, so an
upload step fails harmlessly; do not build a tutorial around one.

### The three files

**`src/tutorial-catalog.ts`** is what the Grove lists. Plain data, no React:

```ts
import { defineTutorialCatalog } from "@frc1678/grove-sdk/tutorial-catalog"

export default defineTutorialCatalog([
  { id: "rsvp", title: "RSVP to a meeting", summary: "Tell your lead whether you're coming.", points: 10, minutes: 2 },
  { id: "take-attendance", title: "Take attendance", summary: "Mark who showed up.", points: 15, minutes: 3, minRole: "lead" },
])
```

`id` is permanent (completions are kept by it). `groups` names Grove groups offered a tutorial whatever their
role (`groups: ["Outreach Leads"]` beside `minRole: "lead"`), for access an
app grants by group; filter by the app's own capability as well. `points` is 5–50, about five
a minute. `minRole` hides a tutorial from people below it. At most 12.

**`vite.config.ts`** writes it to `grove-tutorials.json`, which the Grove
reads:

```ts
import { groveTutorials } from "@frc1678/grove-sdk/build"
import tutorialCatalog from "./src/tutorial-catalog.ts"
// plugins: [..., groveTutorials(tutorialCatalog)]
```

**`src/tutorials.tsx`** is the steps and the effects:

```tsx
import { defineTutorials, practice } from "@frc1678/grove-sdk/react"
import { api } from "../convex/_generated/api"
import catalog from "./tutorial-catalog"

export const tutorials = defineTutorials(catalog, {
  rsvp: {
    effects: [
      practice(api.rsvps.set, (args, box) => {
        // What would this write have changed on screen? Say it for every
        // query that shows it.
        box.patch(api.events.list, args.eventId, { myRsvp: args.status })
        box.patch(api.events.get, args.eventId, { myRsvp: args.status })
        return null
      }),
    ],
    steps: [
      {
        title: "Open a meeting",
        body: <>Pick any meeting from the list.</>,
        route: "/events",
        target: "[data-tour=event-row]",
        until: { at: (path) => path.startsWith("/events/") },
      },
      {
        title: "Say you're coming",
        body: <>Tap <strong>Going</strong>. It only changes on your screen.</>,
        target: "[data-tour=rsvp-going]",
        until: { did: api.rsvps.set },
      },
      { title: "That's an RSVP", body: <>For real, your lead sees it the moment you tap.</> },
    ],
  },
  "take-attendance": { /* … */ },
})
```

Then mount it once, inside `GroveShell`, in the layout that stays mounted
across every route (the same place as `GroveTutorial`):

```tsx
<GroveTutorials tutorials={tutorials} pathname={pathname} navigate={navigate} />
```

### Steps

| Field | |
| --- | --- |
| `title`, `body` | What to do, in the words on the screen. Say what the button is called. |
| `route` | Router path the step starts on. The tutorial goes there if it is not already there. |
| `target` | Selectors tried in order; the first visible one is ringed. Use `data-tour` attributes, and the shell's own (`[data-tour="nav:/x"]`, `[data-tour="menu"]`, `toolbar-search`, …). The page under the ring stays live. |
| `until` | What moves the step on. Without it the step has a **Next** button. |

`until` is one of:

| | Moves on when |
| --- | --- |
| `{ did: api.x.y, when?: (args) => boolean }` | they made that write (practised, blocked, or let through by `allow`) |
| `{ click: "selector" }` | they clicked something matching it |
| `{ see: "selector" }` / `{ gone: "selector" }` | it is on screen / no longer on screen (a dialog opened, closed) |
| `{ at: "/path" }` or `{ at: (pathname) => boolean }` | they reached that page |
| `{ value: "selector", matches?: (value) => boolean }` | that field holds a value |

Every waiting step also offers **Skip this step**, so a page that looks
different from what the author expected is never a dead end. Reaching the
end is what earns the points.

### Effects

`practice(api.module.fn, (args, box) => result)` is typed from the function
reference. Return what the real function returns (an id, usually). `box`:

| | |
| --- | --- |
| `box.insert(query, doc, { at?, where? })` | add a document to a list query (an array, or `{ page: [...] }`). `where: (queryArgs) => boolean` picks which argument sets it shows in |
| `box.patch(query, id, fields)` | merge fields into the document with that `_id`, in a list or as the query's whole result |
| `box.remove(query, id)` | take it out of a list |
| `box.edit(query, (result, queryArgs) => result)` | anything else: counts, nested lists, grouped results |
| `box.doc("task", fields)` | a practice document: the fields plus a practice `_id` and `_creationTime` |
| `box.id("task")` | a practice id, `"practice-task-k3x9a-3"` (typed loosely, so it can be returned where the real mutation returns an `Id`) |
| `box.read(query, args?)` | what a query the page is watching shows right now, for an effect that needs a name or a count |
| `box.readAll(query)` | `[{ args, result }]` for every set of arguments the page watches the query with, for when the write does not carry them |
| `box.find(query, id)` | the document with that `_id` as a watched query shows it now, in a list, a page or as the whole result |
| `box.me` | `{ name, userId }` of the person practising, for a document that shows its author |
| `box.answer(query, (queryArgs) => result \| undefined)` | answer a query in the browser: a practice document's own page, which the server has never heard of |

Rules that keep a tutorial honest:

- **Edit every query that shows the change.** The list, the detail page, the
  count in the header. Read the app's `useQuery` calls for the page, not just
  the mutation. An edit gets the server's real result and must return the
  same shape.
- **A practice id is not a Convex id.** A query whose arguments mention one
  is never sent; it stays loading unless `box.answer` answers it. So either
  answer the detail query or keep the tutorial off the practice document's
  own page.
- **Prefer acting on real data** that is already on screen. Use `setup:
  (box) => …` to lay down a practice document only when the task needs
  something the real data may not have today (an open meeting, a pending
  request).
- `allow: [api.x.lookup]` lets an action that only reads really run.
- Timers that write (presence, autosave) are dropped silently; only a write
  right after a tap or keypress shows the "not saved" note.

### Writes outside Convex

The sandbox sees Convex writes only. An app that also sends its own `fetch`
to a server (a host, a printer bridge), uploads a file, or opens a page that
starts a job should check `useTutorialMode()` and hold those back while it is
true. `practice` is also exported from `@frc1678/grove-sdk/sandbox`, so an
effects file and its tests need not load React.

A step whose `until` is a state (`see`, `gone`, `at`, `value`) that already
holds stays up for a moment first, so it can be read. A step `route` with a
query string (`/queue?lane=grade`) navigates until the query matches too.

### Apps with their own header

`GroveShell` shows the menu item itself. An app that draws its own header
calls `useOpenTutorials()` (null until there is something to offer) and
`useTutorialsBadge()` ("2/5"), inside `TutorialProvider`. `TutorialRunner` is
the runner with no Grove wiring, for a tree that has no `GroveProvider`.

A link `/<slug>/?tutorial=<id>` starts that tutorial; `?tutorial` alone opens
the list. If the app filters its list by a capability that loads late, the link waits a few
seconds for the tutorial to be offered before settling for the list. The Grove's Tutorials page uses it.

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

Every link ends in `?v=` and a hash of the favicon, and so do the
manifest's icon paths. The file names never change, and a cache can keep a
fixed name for good: Convex static hosting takes `apple-touch-icon.png` for
a content-hashed file and serves it immutable for a year. A redrawn favicon
gives every icon a new address, so the new one is what gets fetched.

A phone keeps the icon it saw when the app was added. After an icon change,
remove the app from the home screen and add it again.

## Slack

Every Grove app posts through one workspace bot, so without help every post
says "grove" and nobody can mute one app, and an app that posts a new
message per event buries the channel. `groveSlack` posts as the app and
builds in the rule every app follows:

1. **One message per item** — a request, an event, a task. Post it once,
   keep its `{ channel, ts }` on the item's row, and edit it in place
   (`chat.update`) when the item changes.
2. **Later news goes in that message's thread**, not a new top-level post.
   `broadcast` shows a reply in the channel too; keep it for news the whole
   channel needs.
3. **Anything that isn't urgent waits for a digest.** One post a day (or a
   week) from a cron, and none when there's nothing in it.
4. **Mention someone (`<@U…>`) only when they have to act.** Name anyone
   else in plain text.
5. **Every post comes from the app**: its name, and a PNG of its icon.

```ts
import { groveSlack, slackMention } from "@frc1678/grove-sdk/server"

const slack = groveSlack({ name: "Chime", slug: "chime" }) // package.json's grove.name / grove.slug

const item = await slack.upsert(request.slack, channel, { text, blocks }) // post, or edit in place
await ctx.runMutation(internal.requests.setSlack, { id, slack: item })     // keep channel + ts
await slack.reply(item, { text: `Approved by ${who}` })                    // later news, in the thread
await slack.digest(channel, { title: "Waiting on review", lines })        // posts nothing if lines is empty
await slack.dm(slackUserId, { text: `${slackMention(slackUserId)}, it's your turn` })
```

| Method | What |
| --- | --- |
| `post(channel, message)` | A new item's message. Returns `{ channel, ts }` (the channel as Slack's id, even if you passed a `#name`) |
| `update(item, message)` | Edit it in place. An edit keeps its original author, so a message posted before the app moved to `groveSlack` stays "grove" |
| `upsert(item?, channel, message)` | `update` when there's an item, else `post`. If the old message is gone (deleted, channel archived) it posts a new one; store what comes back |
| `reply(item, message, { broadcast? })` | In the item's thread |
| `digest(channel, { title, lines })` | `*title*` and a bullet per line; `null` and no post when `lines` is empty |
| `dm(slackUserId, message)` | A direct message, as the app |
| `sender()` | `{ username, icon_url }` to spread into a call the helper doesn't make (`chat.postEphemeral`, a hand-rolled client) |

`message` is what `chat.postMessage` takes minus `channel`: `text`, and
`blocks`, `unfurl_links` and the rest as you like. Errors throw
`SlackApiError`, whose `code` is Slack's (`not_in_channel`, …) and whose
message is still `Slack <method> failed: <code>`.

**The icon** is the `icon-512.png` that [`groveHomeScreen()`](#the-home-screen-icon)
draws from `favicon.svg`, at `<GROVE_SITE_URL>/<slug>/icon-512.png`; Slack
ignores an SVG `icon_url`. Pass `iconUrl` for any other PNG. Against a local
Grove there is no icon (Slack can't fetch `localhost`), just the name.

**The scope.** Slack applies `username` and `icon_url` only when the shared
Slack app has the `chat:write.customize` bot scope; without it Slack is
reported to ignore them and post as "grove". Adding the scope means
reinstalling the Slack app to the workspace.

## Search index

The Grove's search finds pages across every app, so someone can type
"buy a motor" and land on Harvest's Request page. Each app says which pages
it has in `grove-index.json`, which `groveIndex()` writes at the root of the
build, so it is served at `/<slug>/grove-index.json`. The Grove re-reads
every app's file daily, when the app is saved in Admin → Apps, and on
Refresh there.

Keep the entries in `src/grove-index.ts`:

```ts
import { defineGroveIndex } from "@frc1678/grove-sdk/search-index"

export default defineGroveIndex([
  {
    path: "/request",
    title: "Request",
    summary: "Ask the team to buy a part or supply.",
    keywords: ["order", "buy", "purchase"],
  },
  { path: "/settings", title: "Settings", summary: "Set budgets and vendors.", minRole: "coach" },
])
```

and pass them to the plugin:

```ts
import { groveIndex } from "@frc1678/grove-sdk/build"
import searchIndex from "./src/grove-index.ts"

export default defineConfig({
  plugins: [react(), tailwindcss(), groveIndex(searchIndex)],
})
```

`@frc1678/grove-sdk/search-index` imports nothing, so the app's nav can
import `src/grove-index.ts` too. (`/build` also loads git and the
filesystem, which do not belong in a browser bundle.) The dev server serves
the same file, so a local Grove can read it from a running app.

The rules, which the Grove's parser enforces and the plugin checks first.
A bad entry fails `vite build` and `vite dev` with a message naming the
entry and the rule, because the Grove would otherwise drop the whole file
and the app would quietly vanish from search:

- `path` — required. The path as the app's router sees it, without
  `/<slug>`. Starts with `/` (not `//`), no backslashes, whitespace or
  `://`, at most 200 characters. A query string is fine: `/orders?tab=open`.
- `title` — required, 1–60 characters once trimmed.
- `summary` — required, 1–200 characters once trimmed, plain text.
- `keywords` — optional, at most 12, each 1–40 characters once trimmed.
- `minRole` — optional, `student` (the default), `lead`, `coach` or
  `admin`. It only decides who sees the result in search; the page still
  enforces access itself.
- At most 60 entries, and no two with the same path. Any other field is an
  error, so a misspelt `minrole` cannot leave a coach page offered to
  everyone.

Writing good entries:

- One entry per page people actually go to, including views that are worth
  landing on directly (`/orders?tab=all`). Not every dialog or detail page.
- The summary is one sentence saying what someone does there, in the words
  a freshman would type: "Ask the team to buy a part or supply.", not
  "Procurement request intake form."
- Keywords are the synonyms the title and summary miss: "buy", "order" and
  "purchase" for a Request page.
- Leave out what the Grove already has: its own pages and "Report a
  problem".

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

## Grove Health

The Grove's Admin → Health watches every app from two sides. It loads the
app's page and its `/<slug>/api/health` route every 5 minutes from outside,
like a person would, and it takes what the app reports about its own
insides: the agents and devices that check in with it, its jobs, its
integrations, the keys it issues. Alerts go to whoever is on call.

The public route answers "up" and a version, never data:

```ts
// convex/http.ts
import { groveHealthResponse } from "@frc1678/grove-sdk/server"

http.route({
  path: `/${pkg.grove.slug}/api/health`,
  method: "GET",
  handler: httpAction(async () => groveHealthResponse({ version: pkg.version })),
})
```

The report runs from a cron every 5 minutes. Its list is whole: a component
the app stops listing is marked gone on the Grove. Send `lastSeenAt` and
`expectEverySec` for anything that checks in, and the Grove turns it amber
at twice its interval and red at three times on its own.

```ts
// convex/groveHealth.ts
import { heartbeatHealth, reportGroveHealth, rosterSyncHealth } from "@frc1678/grove-sdk/server"

export const components = internalQuery({
  args: {},
  handler: async (ctx) => [
    rosterSyncHealth(await ctx.db.query("groveSyncRuns").order("desc").first()),
    ...(await ctx.db.query("agents").take(100)).map((agent) =>
      heartbeatHealth({ key: `agent:${agent.host}`, name: agent.host, lastSeenAt: agent.lastSeenAt, expectEverySec: 60 }),
    ),
  ],
})

export const report = internalAction({
  args: {},
  handler: async (ctx) => {
    await reportGroveHealth(await ctx.runQuery(internal.groveHealth.components, {}))
  },
})

// convex/crons.ts
crons.interval("grove health report", { minutes: 5 }, internal.groveHealth.report, {})
```

A component is `{ key, kind, status, name?, message?, lastSeenAt?,
expectEverySec?, version?, host?, credential? }`, with `kind` one of
`agent`, `job`, `integration`, `credential`, `service` and `status` one of
`ok`, `warn`, `down`, `unknown`. Keys are lowercase words joined by
`: . _ -`; the Grove files each under `<slug>:<key>`. A `credential` carries
`createdAt`, `rotatedAt`, `expiresAt`, `lastUsedAt` and `policyDays`, so a
key the app issues shows its age on the Grove's Secrets page. Never put a
secret or a fingerprint of one in a report.

## Page addresses

Every page a person can reach has its own address, so a link in Slack, a
calendar entry or a bookmark opens that page and nothing else:

- **Every page in the nav has a path.** An app's bare address (`/chime`)
  only redirects to its main page (`/chime/events`). Lists are plural
  nouns, one thing is `/<list>/:id`, no abbreviations, no doubled words.
- **A view worth linking to gets a path or a query parameter**, not only
  component state: a tab people send each other, a filter a guide points
  at.
- **A new feature gets a new path.** Never reuse an old one for something
  else.
- **A renamed page keeps its old address forever.** List it, and call this
  before the router starts (in `src/main.tsx`):

```ts
import { applyLegacyPaths } from "@frc1678/grove-sdk/client";

applyLegacyPaths({
  base: import.meta.env.BASE_URL,
  previousBases: ["/parts/"], // only if the app itself moved
  paths: [
    ["/", "/events"],               // bare address → main page
    ["/e/:id/*", "/events/:id/*"],  // :param is one segment, /* the rest
  ],
});
```

It rewrites the address bar in place (no reload), keeping the query string
and hash. Keep an index route that redirects too, for links inside the app.

**An app whose path differs from its slug** (Foundry: slug `parts`, served
at `/foundry`) sets `package.json` → `grove.path`, builds with
`base: /${path}/`, serves its files under both the path and the slug, and
passes `appSlug` to `GroveProvider`, because the slug — not the path — is
what its reports, usage and engagement are filed under. Its API routes stay
under `/<slug>/api/…`: devices and webhooks are configured with them.

## Named controls

Every button, link and field needs a name a screen reader can say. An icon
on its own is not one. `@frc1678/grove-sdk/lint` is an oxlint plugin that
fails `bun run lint` on a control without a name; turn it on in the app's
`.oxlintrc.json`:

```json
{
  "jsPlugins": ["@frc1678/grove-sdk/lint"],
  "rules": { "grove/labelled-control": "error" }
}
```

It understands Base UI's `render={<Button />}` (the wrapper's text names the
button) and looks inside `<Button>` and `…Trigger`/`…Close` parts, which the
stock jsx-a11y rule does not. The fix is `aria-label="What it does"`, or
visually hidden text inside the control. A select needs one too: its value
("2026") is not its name ("Season").

## No explanations in hover tooltips

A `title` tooltip shows on hover, and a phone never hovers, so anything a
person needs to read cannot live there. The same plugin has a second rule:

```json
{ "rules": { "grove/hover-only-hint": "error" } }
```

It flags `title` on text and on a control that already has a name. It leaves
alone a `title` that only repeats the control's name (an icon-only button),
truncated text (`truncate`, `line-clamp-*`), and component props such as
`<Card title>`. Fix a finding by putting the words on the page. When they
will not fit, use `GroveHint`, a small "?" that opens on a tap:

```tsx
import { GroveHint } from "@frc1678/grove-sdk/react";

Banked <GroveHint label="What does Banked mean?">Extra meetings you can
spend on a later absence.</GroveHint>
```

## Usage counts

The Grove counts how its apps are used, so improvements can be judged by
what people actually do. `GroveProvider` records a page view whenever the
path changes, while someone is signed in. Nothing to set up.

For the actions worth counting, name them:

```tsx
import { useGroveEvent } from "@frc1678/grove-sdk/react";

const track = useGroveEvent();
// …
track("mission.created");
```

Outside React, `trackGroveEvent("mission.created")` does the same. Names
are lowercase letters, digits and `. _ : -`, at most 64 characters. Name
the action, never the person or the record: the name is all that is sent.

What the Grove keeps per event: the app, the event name, the page as a
pattern (`/events/:id`, never the id), the day, the person's role and
subteam (read by the Grove from the session, not sent by the app), and a
random id for the browser tab's session. No user id, name or email. Raw
events are deleted after 30 days; a nightly job keeps daily totals.

The Grove itself mounts `GroveUsage` from `@frc1678/grove-sdk/usage`.
Against a Grove without usage counting, the tracker stops after three
failed sends.

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
