"use client";

import type { ReactNode } from "react";

export function DemoAuthLink({ children }: Readonly<{ children: ReactNode }>) {
  return <a href="/auth/login?return_to=%2Fapp">{children}</a>;
}
