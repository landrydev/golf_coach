import { redirect } from "next/navigation";
import {
  chatGPTSignInPath,
  getChatGPTUser,
  type ChatGPTUser,
} from "@/app/chatgpt-auth";

export type RequestIdentity = ChatGPTUser & {
  source: "siwc" | "development";
};

export async function getRequestIdentity(): Promise<RequestIdentity | null> {
  const signedInUser = await getChatGPTUser();
  if (signedInUser) {
    return { ...signedInUser, source: "siwc" };
  }

  if (process.env.NODE_ENV !== "production") {
    const email = process.env.DEV_AUTH_EMAIL?.trim() || "owner@roadmap.local";
    const fullName = process.env.DEV_AUTH_NAME?.trim() || "Roadmap Owner";
    return {
      displayName: fullName,
      email,
      fullName,
      source: "development",
    };
  }

  return null;
}

export async function requirePageIdentity(
  returnTo: string,
): Promise<RequestIdentity> {
  const identity = await getRequestIdentity();
  if (identity) return identity;

  redirect(chatGPTSignInPath(returnTo));
}

export async function requireApiIdentity(): Promise<
  | { identity: RequestIdentity; response: null }
  | { identity: null; response: Response }
> {
  const identity = await getRequestIdentity();
  if (identity) return { identity, response: null };

  return {
    identity: null,
    response: Response.json(
      { error: { code: "authentication_required", message: "Sign in required." } },
      { status: 401 },
    ),
  };
}
