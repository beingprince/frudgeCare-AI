/**
 * Lightweight PDF download helper for the browser (demo).
 * Loads jsPDF from CDN on first use — matches the pattern on /provider/case.
 */

let jspdfLoading: Promise<void> | null = null;

// UMD bundle exposes `window.jspdf.jsPDF` (see provider case export).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsPdfCtor = new (opts?: Record<string, unknown>) => any;
type JsPdfGlobal = { jsPDF: JsPdfCtor };

export async function ensureJsPdf(): Promise<JsPdfGlobal | null> {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { jspdf?: JsPdfGlobal };
  if (w.jspdf?.jsPDF) return w.jspdf;
  if (!jspdfLoading) {
    jspdfLoading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src =
        "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load jsPDF"));
      document.body.appendChild(script);
    });
  }
  try {
    await jspdfLoading;
    return (window as unknown as { jspdf: JsPdfGlobal }).jspdf ?? null;
  } catch {
    return null;
  }
}

export type PdfTextLine = string | { bold?: boolean; text: string; gapAfter?: number };

/**
 * General-purpose: title + monospace-friendly body, footer confidentiality line.
 */
export async function downloadTextPdf(
  filename: string,
  title: string,
  lines: PdfTextLine[],
  footer = "FrudgeCare — demo export. For your records only. Not a medical record replacement.",
): Promise<boolean> {
  const jspdf = await ensureJsPdf();
  if (!jspdf) return false;
  const { jsPDF } = jspdf;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(title, 72, 72);
  doc.setLineWidth(0.5);
  doc.line(72, 78, 520, 78);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  let y = 100;
  const add = (s: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    const parts = doc.splitTextToSize(s, 470);
    doc.text(parts, 72, y);
    y += parts.length * 14 + 4;
  };
  for (const line of lines) {
    if (typeof line === "string") {
      add(line, false);
    } else {
      add(line.text, line.bold);
      y += (line.gapAfter ?? 0) * 14;
    }
  }
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(footer, 72, 750, { maxWidth: 470 });
  doc.save(filename);
  return true;
}
