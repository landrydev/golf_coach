"use client";

import { useMemo } from "react";
import { encode } from "uqr";

export function ShareQrCode({ value }: { value: string }) {
  const qr = useMemo(
    () => encode(value, { ecc: "M", boostEcc: true, border: 4 }),
    [value],
  );
  const path = useMemo(() => {
    const commands: string[] = [];
    for (let y = 0; y < qr.size; y += 1) {
      for (let x = 0; x < qr.size; x += 1) {
        if (qr.data[y]?.[x]) commands.push(`M${x} ${y}h1v1h-1z`);
      }
    }
    return commands.join("");
  }, [qr]);

  return (
    <svg
      aria-labelledby="private-roadmap-qr-title"
      role="img"
      viewBox={`0 0 ${qr.size} ${qr.size}`}
      width="216"
      height="216"
      shapeRendering="crispEdges"
    >
      <title id="private-roadmap-qr-title">QR code for the private roadmap link</title>
      <rect width={qr.size} height={qr.size} fill="#fffdf7" />
      <path d={path} fill="#102f28" />
    </svg>
  );
}
