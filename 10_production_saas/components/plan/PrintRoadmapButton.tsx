"use client";

import styles from "./plan.module.css";

export function PrintRoadmapButton() {
  return (
    <button
      className={styles.printControl}
      type="button"
      onClick={() => window.print()}
    >
      Print or save PDF
    </button>
  );
}
