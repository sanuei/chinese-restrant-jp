import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { getDb } from "@/lib/cloudflare";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, profile }) {
      // profile 只在刚登录（Google 回调）时存在，之后的请求靠 token 里已有的信息
      if (profile?.sub) {
        token.sub = profile.sub;
        token.name = profile.name;
        token.email = profile.email;
        token.picture = typeof profile.picture === "string" ? profile.picture : undefined;

        try {
          const db = await getDb();
          await db.prepare(`
            INSERT INTO users (id, email, display_name, avatar_url)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              email = excluded.email,
              display_name = excluded.display_name,
              avatar_url = excluded.avatar_url
          `).bind(
            profile.sub,
            profile.email || "",
            profile.name || null,
            typeof profile.picture === "string" ? profile.picture : null
          ).run();
        } catch (e) {
          console.error("[auth] upsert user failed:", e);
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
});
