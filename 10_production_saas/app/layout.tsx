import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

const title = "Roadmap | Coach-branded golf development roadmaps";
const description =
  "Turn a golf assessment into a clear, coach-branded development roadmap and an appropriate first lesson-package recommendation.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host")?.split(",")[0]?.trim();
  const candidateHost = requestHeaders.get("host")?.trim() || forwardedHost;
  const host = candidateHost && /^[a-z0-9.-]+(?::\d{1,5})?$/i.test(candidateHost)
    ? candidateHost
    : undefined;
  const isLocal = host?.startsWith("localhost") || host?.startsWith("127.0.0.1");
  const protocol = isLocal ? "http" : "https";
  let metadataBase: URL | undefined;
  const configuredOrigin = process.env.APP_URL?.trim();

  if (configuredOrigin) {
    try {
      const parsedOrigin = new URL(configuredOrigin);
      if (
        parsedOrigin.protocol === "https:" &&
        !parsedOrigin.username &&
        !parsedOrigin.password &&
        !parsedOrigin.search &&
        !parsedOrigin.hash &&
        ["", "/"].includes(parsedOrigin.pathname)
      ) {
        metadataBase = new URL(parsedOrigin.origin);
      }
    } catch {
      metadataBase = undefined;
    }
  }

  if (!metadataBase && host) {
    try {
      metadataBase = new URL(`${protocol}://${host}`);
    } catch {
      metadataBase = undefined;
    }
  }

  // Some Worker adapters do not expose the request host to Next metadata.
  // Production supplies APP_URL; this deterministic fallback keeps metadata
  // complete in isolated builds and is surfaced as unconfigured by health.
  metadataBase ??= new URL("https://roadmap.example");
  const socialImage = new URL("/og.png", metadataBase);

  return {
    metadataBase,
    title,
    description,
    applicationName: "Roadmap",
    category: "business",
    icons: {
      icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title,
      description,
      type: "website",
      locale: "en_CA",
      siteName: "Roadmap",
      images: [
        {
          url: socialImage,
          width: 1734,
          height: 909,
          alt: "Roadmap — Sell the plan, not another hour.",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [socialImage],
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light",
  themeColor: "#173d31",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-CA">
      <body>{children}</body>
    </html>
  );
}
