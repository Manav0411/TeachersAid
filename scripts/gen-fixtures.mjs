// Generates two synthetic, TYPED fixture pairs under fixtures/ that stress
// extraction and mapping specifically:
//   - sub-parts: two-column layout, lettered AND roman-numeral sub-parts
//   - chaos: out-of-order answers, a mislabeled answer, an unlabeled
//            answer, and an answer to a nonexistent question number
// Not a substitute for real handwriting — see fixtures/README.md.
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

/** Draws a numbered item at (x, y..) within `width`, returns the new y. */
function drawItem(page, font, x, y, width, num, text, marks) {
  const wrapped = wrapText(font, text, 10.5, width - 10);
  wrapped.forEach((l, i) => {
    page.drawText(i === 0 ? `${num} ${l}` : `   ${l}`, { x, y, size: 10.5, font });
    y -= 14;
  });
  if (marks) {
    page.drawText(marks, { x: x + width - 40, y: y + 14, size: 8.5, font, color: rgb(0.4, 0.4, 0.4) });
  }
  return y - 6;
}

// ---------------------------------------------------------------------------
// Fixture: sub-parts — two columns, lettered + roman sub-parts
// ---------------------------------------------------------------------------

async function buildSubPartsQuestionPaper() {
  const doc = await PDFDocument.create();
  const page = doc.addPage(PAGE_SIZE);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const left = 50;
  const colWidth = 240;
  const colGap = 20;
  const rightX = left + colWidth + colGap;

  page.drawText("Class 9 — General Science Test", { x: left, y: 745, size: 15, font: bold });
  page.drawText("Section A", { x: left, y: 715, size: 12, font: bold });

  let yLeft = 695;
  yLeft = drawItem(page, font, left, yLeft, colWidth, "1.", "Name the SI unit of force.", null);
  yLeft = drawItem(
    page,
    font,
    left,
    yLeft,
    colWidth,
    "2.",
    "State whether sound can travel through vacuum.",
    null
  );

  let yRight = 695;
  yRight = drawItem(page, font, rightX, yRight, colWidth, "3.", "Define density.", null);
  yRight = drawItem(
    page,
    font,
    rightX,
    yRight,
    colWidth,
    "4.",
    "Name the gas released during respiration.",
    null
  );

  const sectionBY = Math.min(yLeft, yRight) - 20;
  page.drawText("Section B", { x: left, y: sectionBY, size: 12, font: bold });
  let y = sectionBY - 20;
  const width = 492;

  y = drawItem(
    page,
    font,
    left,
    y,
    width,
    "11.",
    "Newton's laws of motion describe the relationship between a body and the forces acting on it.",
    null
  );
  y = drawItem(page, font, left, y, width, "11 (a)", "State Newton's first law of motion.", "[2 marks]");
  y = drawItem(page, font, left, y, width, "11 (b)", "State Newton's third law of motion.", "[2 marks]");
  y = drawItem(
    page,
    font,
    left,
    y,
    width,
    "11 (c)",
    "Give one everyday example of Newton's third law.",
    "[1 mark]"
  );

  y -= 8;
  y = drawItem(
    page,
    font,
    left,
    y,
    width,
    "12.",
    "Answer the following about the water cycle:",
    null
  );
  y = drawItem(page, font, left, y, width, "12 (i)", "Name the process by which water vapour forms clouds.", "[1 mark]");
  y = drawItem(page, font, left, y, width, "12 (ii)", "Name the process by which clouds release water as rain.", "[1 mark]");
  y = drawItem(page, font, left, y, width, "12 (iii)", "Name the process by which water enters the atmosphere from oceans.", "[1 mark]");

  return doc.save();
}

async function buildSubPartsAnswerSheet() {
  const doc = await PDFDocument.create();
  const page = doc.addPage(PAGE_SIZE);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = 740;
  const left = 60;
  const width = 492;

  page.drawText("Student: Rohan Verma", { x: left, y, size: 12, font: bold });
  y -= 30;

  function answer(label, text) {
    page.drawText(label, { x: left, y, size: 11, font: bold });
    y -= 16;
    const wrapped = wrapText(font, text, 11, width - 10);
    wrapped.forEach((l) => {
      page.drawText(l, { x: left + 14, y, size: 11, font });
      y -= 16;
    });
    y -= 10;
  }

  answer("1.", "Newton (N)");
  answer("2.", "No, sound needs a medium and cannot travel through vacuum.");
  answer("3.", "Density is mass per unit volume of a substance.");
  answer("4.", "Carbon dioxide");
  answer("11(a).", "A body remains at rest or in uniform motion unless acted upon by a net external force.");
  answer("11(b).", "For every action there is an equal and opposite reaction.");
  answer("11(c).", "Walking: the foot pushes back on the ground and the ground pushes the foot forward.");
  answer("12(i).", "Condensation");
  answer("12(ii).", "Precipitation");
  answer("12(iii).", "Evaporation");

  return doc.save();
}

// ---------------------------------------------------------------------------
// Fixture: chaos — out-of-order, mislabeled, unlabeled, nonexistent-number
// ---------------------------------------------------------------------------

async function buildChaosQuestionPaper() {
  const doc = await PDFDocument.create();
  const page = doc.addPage(PAGE_SIZE);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = 740;
  const left = 60;
  const width = 492;

  page.drawText("Class 8 — Environmental Science Test", { x: left, y, size: 15, font: bold });
  y -= 34;

  const items = [
    ["1.", "What is the chemical formula of water?", "[1 mark]"],
    ["2.", "Name the process by which plants lose water vapour through their leaves.", "[1 mark]"],
    ["3.", "What is the boiling point of water at sea level, in degrees Celsius?", "[1 mark]"],
    ["4.", "State one use of water as a raw material in photosynthesis.", "[1 mark]"],
    ["5.", "Define the water cycle in one or two sentences.", "[2 marks]"],
  ];
  for (const [num, text, marks] of items) {
    y = drawItem(page, font, left, y, width, num, text, marks);
  }

  return doc.save();
}

async function buildChaosAnswerSheet() {
  const doc = await PDFDocument.create();
  const page = doc.addPage(PAGE_SIZE);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = 740;
  const left = 60;
  const width = 492;

  page.drawText("Student: Ayesha Khan", { x: left, y, size: 12, font: bold });
  y -= 30;

  function answer(label, text) {
    if (label) {
      page.drawText(label, { x: left, y, size: 11, font: bold });
      y -= 16;
    }
    const wrapped = wrapText(font, text, 11, width - 10);
    wrapped.forEach((l) => {
      page.drawText(l, { x: left + 14, y, size: 11, font });
      y -= 16;
    });
    y -= 10;
  }

  // Out of order: Q4's answer written first.
  answer("4.", "Water is used as a raw material in photosynthesis, providing hydrogen ions for the light reactions.");
  answer("1.", "H2O");
  // Unlabeled — clearly the answer to Q2, but the student wrote no number.
  answer(null, "Transpiration is the process by which plants lose water vapour through stomata in their leaves.");
  answer("3.", "100 degrees Celsius");
  // Mislabeled with a number that doesn't exist on the paper (7) — content
  // actually answers Q5.
  answer(
    "7.",
    "The water cycle involves evaporation, condensation, and precipitation, continuously moving water between the atmosphere, land, and oceans."
  );
  // Genuinely off-topic — should stay unmatched, not force-mapped to anything.
  answer("9.", "The chemical symbol for oxygen is O2, a diatomic molecule essential for respiration.");

  return doc.save();
}

// ---------------------------------------------------------------------------

async function writeFixture(dir, questionBytes, answerBytes) {
  const outDir = new URL(`../fixtures/${dir}/`, import.meta.url);
  await mkdir(outDir, { recursive: true });
  await writeFile(new URL("question-paper.pdf", outDir), questionBytes);
  await writeFile(new URL("answer-sheet.pdf", outDir), answerBytes);
  console.log(`Wrote fixtures/${dir}/question-paper.pdf and answer-sheet.pdf`);
}

await writeFixture("sub-parts", await buildSubPartsQuestionPaper(), await buildSubPartsAnswerSheet());
await writeFixture("chaos", await buildChaosQuestionPaper(), await buildChaosAnswerSheet());
