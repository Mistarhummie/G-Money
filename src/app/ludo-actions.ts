"use server";

import { redirect } from "next/navigation";
import { getDb, type Db } from "@/db";
import type { LudoGame, User } from "@/db/schema";
import { UserError } from "@/lib/errors";
import * as ludo from "@/lib/ludo/service";
import { getCurrentUser } from "@/lib/session";

type Result = { error?: string; view?: ludo.LudoView };

/** Runs a Ludo action for the signed-in player; player-facing errors come back as `error`. */
async function withUser<T>(fn: (user: User) => Promise<T>): Promise<T | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to play" };
  try {
    return await fn(user);
  } catch (err) {
    if (err instanceof UserError) return { error: err.message };
    throw err;
  }
}

export async function startLudoComputerAction(stage: number, opponents: number): Promise<{ error?: string }> {
  const res = await withUser(async (user) => (await ludo.startComputerGame(await getDb(), user, { stage, opponents })).id);
  if (typeof res === "string") redirect(`/play/ludo/${res}`);
  return res;
}

export async function ludoQuickMatchAction(size: number): Promise<{ error?: string }> {
  const res = await withUser(async (user) => (await ludo.quickMatch(await getDb(), user, size)).id);
  if (typeof res === "string") redirect(`/play/ludo/${res}`);
  return res;
}

export async function ludoCreateTableAction(_: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  const res = await withUser(async (user) =>
    (await ludo.createTable(await getDb(), user, { size: Number(form.get("size") ?? 4), invite: String(form.get("invite") ?? "") })).id,
  );
  if (typeof res === "string") redirect(`/play/ludo/${res}`);
  return res;
}

/** Runs a table action and returns the table as this player now sees it, with the log from `from` on. */
async function viewAfter(fn: (db: Db, user: User) => Promise<LudoGame>, from: number): Promise<Result> {
  return withUser(async (user) => {
    const db = await getDb();
    const g = await fn(db, user);
    return { view: await ludo.ludoView(db, g, user, from) };
  });
}

export async function ludoJoinAction(id: string): Promise<Result> {
  return viewAfter((db, user) => ludo.joinTable(db, user, String(id)), 0);
}

export async function ludoStartAction(id: string, fill: boolean): Promise<Result> {
  return viewAfter((db, user) => ludo.startTable(db, user, String(id), !!fill), 0);
}

export async function ludoLeaveAction(id: string, from: number): Promise<Result> {
  return viewAfter((db, user) => ludo.leaveTable(db, user, String(id)), Number(from) || 0);
}

/** Asks the server to roll. `ply` is how many actions this screen has seen. */
export async function ludoRollAction(id: string, ply: number): Promise<Result> {
  return viewAfter((db, user) => ludo.ludoAct(db, user, String(id), { kind: "roll" }, Math.trunc(Number(ply))), Math.trunc(Number(ply)));
}

export async function ludoMoveAction(id: string, token: number, ply: number): Promise<Result> {
  return viewAfter(
    (db, user) => ludo.ludoAct(db, user, String(id), { kind: "move", token: Math.trunc(Number(token)) }, Math.trunc(Number(ply))),
    Math.trunc(Number(ply)),
  );
}
