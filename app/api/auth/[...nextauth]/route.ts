import { PrismaClient } from "@prisma/client";
import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const prisma = new PrismaClient();

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      try {
        const existingUser = await prisma.user.findUnique({
          where: {
            googleId: user.id,
          },
        });
        if (existingUser) {
          return true; // sign-in was successful
        } else {
          const newUser = await prisma.user.create({
            data: {
              name: user.name,
              email: user.email,
              hashedPassword: "",
              profilePicture: user.image,
              googleId: user.id,
            },
          });
          return true; // sign-in was successful
        }
      } catch (error) {
        console.error("An error occurred during sign-in:", error);
        return false; // sign-in failed
      }
    },
    async session({ session, token, user }) {
      const dbUser = await prisma.user.findUnique({
        where: { googleId: token.sub },
      });

      if (dbUser) {
        return {
          ...session,
          user: {
            ...session.user,
            id: dbUser.id,
          },
        };
      }
      return session;
    },
  },
});

export { handler as GET, handler as POST };
