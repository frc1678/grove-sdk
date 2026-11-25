import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { functionName, type SandboxEffect, type SandboxTools } from "./sandbox";

// One practised write:
//
//   practice(api.tasks.create, (args, box) => {
//     const task = box.doc("task", { title: args.title, done: false });
//     box.insert(api.tasks.list, task);
//     return task._id;
//   })
//
// Exported from "@frc1678/grove-sdk/sandbox" as well as "/react", so a
// plain effects file and its test need not load React.
export function practice<Fn extends FunctionReference<"mutation" | "action">>(
  fn: Fn,
  run: (args: FunctionArgs<Fn>, tools: SandboxTools) => FunctionReturnType<Fn> | void,
): SandboxEffect {
  return { name: functionName(fn), run };
}
