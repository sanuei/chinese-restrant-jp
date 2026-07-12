"use server";

import { signIn, signOut } from "@/lib/auth";

export async function googleSignIn(callbackUrl: string) {
  await signIn("google", { redirectTo: callbackUrl });
}

export async function userSignOut(callbackUrl: string) {
  await signOut({ redirectTo: callbackUrl });
}
