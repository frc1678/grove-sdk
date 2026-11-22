import { ConvexReactClient, type ConvexReactClientOptions, type Watch } from "convex/react";
import { getFunctionName, makeFunctionReference, type FunctionReference } from "convex/server";
import { Sandbox, type SandboxOptions } from "./sandbox";

// How long a practised write takes to "save". Long enough that a button's
// saving state shows, as it would against the server.
const PRACTICE_DELAY_MS = 120;

// The Convex client every Grove app talks to its own deployment through,
// with the tutorial sandbox (sandbox.ts) on the only two doors a write can
// leave by. While the sandbox is closed this is ConvexReactClient exactly:
// every method below falls straight through to it.
//
// useQuery, useMutation and useAction all go through `watchQuery`,
// `mutation` and `action` on the client in context, so wrapping those three
// covers every hook in every app with no change to the app.
export class SandboxConvexClient extends ConvexReactClient {
  readonly sandbox: Sandbox;

  constructor(address: string, options?: ConvexReactClientOptions, sandbox?: SandboxOptions) {
    super(address, options);
    this.sandbox = new Sandbox(sandbox);
    // box.read: the result the client already holds for a query the page is
    // watching. Reading does not subscribe, so an unwatched query is
    // undefined rather than fetched.
    this.sandbox.reader = (name, args) => {
      try {
        return (super.watchQuery as (...all: unknown[]) => Watch<unknown>)(
          makeFunctionReference<"query">(name),
          args,
        ).localQueryResult();
      } catch {
        return undefined;
      }
    };
  }

  override watchQuery<Query extends FunctionReference<"query">>(
    query: Query,
    ...argsAndOptions: any[]
  ): Watch<Query["_returnType"]> {
    const base = (super.watchQuery as (...all: unknown[]) => Watch<Query["_returnType"]>)(
      query,
      ...argsAndOptions,
    );
    const sandbox = this.sandbox;
    const name = getFunctionName(query);
    const args: unknown = argsAndOptions[0] ?? {};
    // The view is worked out again only when the server's result or the
    // layer changed. React compares what a watch returns by identity, and an
    // edit builds a new array every time it runs: without this, a page
    // would re-render for ever.
    let memo: { base: unknown; version: number; local: boolean; view: unknown } | null = null;
    return {
      ...base,
      onUpdate: (callback: () => void) => {
        const offLayer = sandbox.subscribe(callback);
        // A query about a practice document is never sent. The server
        // would refuse the id, and the refusal would reach the page as an
        // error.
        const offServer = sandbox.isLocal(args) ? () => {} : base.onUpdate(callback);
        return () => {
          offLayer();
          offServer();
        };
      },
      localQueryResult: () => {
        const local = sandbox.isLocal(args);
        const server = local ? undefined : base.localQueryResult();
        if (
          memo !== null &&
          memo.base === server &&
          memo.version === sandbox.version &&
          memo.local === local
        ) {
          return memo.view as Query["_returnType"];
        }
        const view = sandbox.view(name, args, () => server);
        memo = { base: server, version: sandbox.version, local, view };
        return view as Query["_returnType"];
      },
    };
  }

  override mutation<Mutation extends FunctionReference<"mutation">>(
    mutation: Mutation,
    ...argsAndOptions: any[]
  ): Promise<Awaited<Mutation["_returnType"]>> {
    const practised = this.practise("mutation", mutation, argsAndOptions[0]);
    if (practised !== null) return practised as Promise<Awaited<Mutation["_returnType"]>>;
    return (super.mutation as (...all: unknown[]) => Promise<Awaited<Mutation["_returnType"]>>)(
      mutation,
      ...argsAndOptions,
    );
  }

  override action<Action extends FunctionReference<"action">>(
    action: Action,
    ...args: any[]
  ): Promise<Awaited<Action["_returnType"]>> {
    const practised = this.practise("action", action, args[0]);
    if (practised !== null) return practised as Promise<Awaited<Action["_returnType"]>>;
    return (super.action as (...all: unknown[]) => Promise<Awaited<Action["_returnType"]>>)(
      action,
      ...args,
    );
  }

  // The write's practice result, or null when it should be sent as usual.
  private practise(
    kind: "mutation" | "action",
    fn: FunctionReference<"mutation" | "action">,
    args: unknown,
  ): Promise<unknown> | null {
    if (!this.sandbox.active) return null;
    const result = this.sandbox.write(kind, getFunctionName(fn), args ?? {});
    if (!result.handled) return null;
    return new Promise((resolve) => setTimeout(() => resolve(result.value), PRACTICE_DELAY_MS));
  }
}
