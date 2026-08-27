// Generates the bundled "Try a sample" fixture PDFs under public/samples/.
// These are synthetic, TYPED documents (not real handwriting) — they exist
// to let a reviewer exercise the full pipeline in one click without a real
// exam paper to hand (PRD §9). They are not a substitute for a handwriting
// accuracy benchmark; see fixtures/README.md for that.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { writeFile, mkdir } from "node:fs/promises";

const PAGE_SIZE = [612, 792]; // US Letter, points

function wrapText(font, text, size, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function buildQuestionPaper() {
  const doc = await PDFDocument.create();
  const page = doc.addPage(PAGE_SIZE);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = 740;
  const left = 60;
  const width = 492;

  page.drawText("Class 10 — Biology Unit Test", { x: left, y, size: 16, font: bold });
  y -= 30;
  page.drawText("Section A", { x: left, y, size: 13, font: bold });
  y -= 22;

  const sectionA = [
    ["1.", "What is the powerhouse of the cell?", "[1 mark]"],
    [
      "2.",
      "Which gas do plants absorb from the atmosphere for photosynthesis?\n(A) Oxygen  (B) Carbon dioxide  (C) Nitrogen  (D) Hydrogen",
      "[1 mark]",
    ],
    ["3.", "Define photosynthesis.", "[2 marks]"],
  ];
  for (const [num, text, marks] of sectionA) {
    for (const line of text.split("\n")) {
      const wrapped = wrapText(font, line, 11, width - 20);
      wrapped.forEach((l, i) => {
        page.drawText(i === 0 ? `${num} ${l}` : `    ${l}`, { x: left, y, size: 11, font });
        y -= 16;
      });
    }
    page.drawText(marks, { x: left + width - 50, y: y + 16, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
    y -= 6;
  }

  y -= 14;
  page.drawText("Section B", { x: left, y, size: 13, font: bold });
  y -= 22;

  const sectionB = [
    [
      "4.",
      "Explain the process of photosynthesis, naming the reactants and products.",
      "[3 marks]",
    ],
    ["5 (a).", "What is the role of chlorophyll in photosynthesis?", "[2 marks]"],
    ["5 (b).", "Name two factors that affect the rate of photosynthesis.", "[2 marks]"],
    ["6.", "Describe the water cycle in brief.", "[3 marks]"],
  ];
  for (const [num, text, marks] of sectionB) {
    const wrapped = wrapText(font, text, 11, width - 20);
    wrapped.forEach((l, i) => {
      page.drawText(i === 0 ? `${num} ${l}` : `      ${l}`, { x: left, y, size: 11, font });
      y -= 16;
    });
    page.drawText(marks, { x: left + width - 50, y: y + 16, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
    y -= 6;
  }

  return doc.save();
}

async function buildAnswerSheet() {
  const doc = await PDFDocument.create();
  const page = doc.addPage(PAGE_SIZE);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = 740;
  const left = 60;
  const width = 492;

  page.drawText("Student: Priya Sharma", { x: left, y, size: 12, font: bold });
  y -= 30;

  function answer(label, text, opts = {}) {
    page.drawText(label, { x: left, y, size: 11, font: bold });
    y -= 16;
    const wrapped = wrapText(font, text, 11, width - 10);
    const startY = y;
    wrapped.forEach((l) => {
      page.drawText(l, { x: left + 14, y, size: 11, font });
      y -= 16;
    });
    if (opts.strike) {
      const midY = (startY + y + 16) / 2;
      page.drawLine({
        start: { x: left + 10, y: midY },
        end: { x: left + width - 20, y: midY },
        thickness: 1.2,
        color: rgb(0.7, 0.1, 0.1),
      });
    }
    y -= 12;
  }

  answer("1.", "Chloroplast is the powerhouse of the cell.", { strike: true });
  answer("1.", "Mitochondria is the powerhouse of the cell.");
  answer("2.", "(B) Carbon dioxide");
  answer(
    "3.",
    "Photosynthesis is the process by which green plants make their own food using sunlight, water, and carbon dioxide, releasing oxygen."
  );
  answer(
    "4.",
    "Plants absorb carbon dioxide through their leaves and water through their roots. Using sunlight captured by chlorophyll, these are converted into glucose and oxygen: 6CO2 + 6H2O -> C6H12O6 + 6O2."
  );
  answer(
    "5(a).",
    "Chlorophyll absorbs sunlight, mainly in the red and blue regions, providing the energy needed to drive photosynthesis."
  );
  answer(
    "5(b).",
    "Light intensity and the concentration of carbon dioxide both affect the rate of photosynthesis."
  );

  y -= 4;
  page.drawText("[rough work] 6 CO2 + 6 H2O -> ? (check coefficients)", {
    x: left,
    y,
    size: 9,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  return doc.save();
}

const outDir = new URL("../public/samples/", import.meta.url);
await mkdir(outDir, { recursive: true });
await writeFile(new URL("question-paper.pdf", outDir), await buildQuestionPaper());
await writeFile(new URL("answer-sheet.pdf", outDir), await buildAnswerSheet());
console.log("Wrote public/samples/question-paper.pdf and answer-sheet.pdf");
