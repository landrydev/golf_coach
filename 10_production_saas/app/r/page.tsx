import type { Metadata } from "next";
import { ShareAccess } from "./ShareAccess";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Private coaching plan | Roadmap",
  robots: { index: false, follow: false, nocache: true },
};

export default function ShareEntryPage() {
  return <ShareAccess />;
}
