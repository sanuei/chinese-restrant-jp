"use server";

import { signIn, signOut } from "@/lib/auth";

export async function googleSignIn(callbackUrl: string) {
  await signIn("google", { redirectTo: callbackUrl });
}

export async function adminGoogleSignIn(callbackUrl: string) {
  const redirectTo = callbackUrl.startsWith("/admin") ? callbackUrl : "/admin";
  await signIn("google", { redirectTo }, { prompt: "select_account" });
}

export async function userSignOut(callbackUrl: string) {
  await signOut({ redirectTo: callbackUrl });
}
