import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { encode } from "uqr";

test("share centre provides a real QR payload and truthful prepared-message controls", async () => {
  const [publishControls, qrComponent] = await Promise.all([
    readFile(
      new URL("../app/app/golfers/[golferId]/PublishControls.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../components/share/ShareQrCode.tsx", import.meta.url), "utf8"),
  ]);
  const privateUrl = "https://roadmap.example/r#sample-private-capability";
  const qr = encode(privateUrl, { ecc: "M", boostEcc: true, border: 4 });

  assert.ok(qr.size >= 21);
  assert.ok(qr.data.some((row) => row.some(Boolean)));
  assert.match(qrComponent, /encode\(value/);
  assert.match(qrComponent, /QR code for the private roadmap link/);
  assert.match(publishControls, /Copy prepared message/);
  assert.match(publishControls, /Roadmap did not send this message automatically/);
  assert.match(publishControls, /same private link above/);
});

test("golfer roadmap exposes print\/PDF control and removes screen-only actions from print", async () => {
  const [button, view, styles, media] = await Promise.all([
    readFile(new URL("../components/plan/PrintRoadmapButton.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/plan/PlanView.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/plan/plan.module.css", import.meta.url), "utf8"),
    readFile(new URL("../components/plan/PrivatePlanMedia.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(button, /window\.print\(\)/);
  assert.match(button, /Print or save PDF/);
  assert.match(view, /<PrintRoadmapButton \/>/);
  assert.match(styles, /@media print/);
  assert.match(styles, /\.choicePanel/);
  assert.match(styles, /\.printControl/);
  assert.match(styles, /\.mediaUnavailable button/);
  assert.match(styles, /\.mediaLoading/);
  assert.match(media, /Loading selected private media\.\.\./);
  assert.doesNotMatch(media, /Loading selected private mediaâ/);
  assert.match(styles, /@page/);
  assert.match(view, /<DrillGuidance item=\{activePractice\} \/>/);
  assert.match(view, /styles\.screenOnlyDisclosure/);
  assert.match(view, /styles\.printOnlyContent/);
  assert.match(view, /<b>Transcript<\/b>/);
  assert.match(styles, /\.printOnlyContent\s*\{\s*display:\s*none/);
  assert.match(
    styles,
    /@media print[\s\S]*\.screenOnlyDisclosure[\s\S]*display:\s*none[\s\S]*\.printOnlyContent\s*\{\s*display:\s*block/,
  );
});
