#!/usr/bin/env python3
"""Functional positional QA for the NYDA + SEFA form templates.

Verifies, on the FILLED PDFs produced by render-filled-samples.ts (npm run verify:form-positions), that:
  1. Drawn text values appear inside the expected answer regions (pdfplumber,
     top-left origin, same system used to measure the blank forms). Region
     text is normalised and space-collapsed because pdf-lib kerns glyphs
     one by one, which splits words in extraction.
  2. Tick X marks exist as vector lines inside the expected rects.
  3. Nothing was drawn on regions that must stay blank (signatures,
     branch-use boxes, the non-applicable business section).

Exit 0 only when every check passes.
"""
import sys
import pdfplumber

import os
WORK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".form-qa")
passed = 0
failed = 0
failures = []


def check(name, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"  ok {name}")
    else:
        failed += 1
        failures.append(f"{name} {detail}")
        print(f"  FAIL {name} {detail}")


def region_text(pdf, pageno, x0, top, x1, bottom):
    region = pdf.pages[pageno].crop((x0, top, x1, bottom))
    text = (region.extract_text() or "").replace("\n", " ")
    return " ".join(text.split())


def region_contains(pdf, pageno, phrase, x0, top, x1, bottom):
    norm = region_text(pdf, pageno, x0, top, x1, bottom)
    # pdf-lib kerns glyph-by-glyph (splits words) and the NYDA answer lines
    # are printed underscores that interleave with drawn glyphs, so compare
    # with spaces and underscores stripped.
    compact = norm.replace(" ", "").replace("_", "")
    return phrase.replace(" ", "").replace("_", "") in compact


def count_lines_in(pdf, pageno, x_min, x_max, top_min, top_max):
    n = 0
    page = pdf.pages[pageno]
    for line in page.lines:
        cx = (line["x0"] + line["x1"]) / 2
        cy = (line["top"] + line["bottom"]) / 2
        if x_min <= cx <= x_max and top_min <= cy <= top_max:
            n += 1
    return n


def tick_present(pdf, pageno, x0, top, size=10.0):
    # An engine tick draws 2 crossing lines, shrunk 1.4pt inside the rect.
    return count_lines_in(pdf, pageno, x0 + 1, x0 + size - 1, top + 1, top + size - 1) >= 2


def nyda_checks():
    print("-- NYDA (existing business) --")
    with pdfplumber.open(f"{WORK}/filled-nyda.pdf") as pdf:
        # Page 1 (idx 0): Section A. Answer cells: x 118-533, label baseline rows.
        check("full names drawn in the answer cell", region_contains(pdf, 0, "Thandiwe", 118, 489, 540, 505))
        check("surname drawn in the answer cell", region_contains(pdf, 0, "Mokoena", 118, 508, 540, 524))
        check("ID number drawn", region_contains(pdf, 0, "9901235600089", 118, 527, 540, 543))
        check("age drawn right of the Age label", region_contains(pdf, 0, "27", 426, 544, 540, 561))
        check("female tick beside the option", tick_present(pdf, 0, 158, 548))
        check("no male tick", not tick_present(pdf, 0, 283, 548))
        check("african population tick", tick_present(pdf, 0, 156, 599.7))
        check("home language drawn right of the label", region_contains(pdf, 0, "isiXhosa", 426, 596, 540, 614))
        check("disability No tick", tick_present(pdf, 0, 138, 651.5))
        check("no disability-Yes tick", not tick_present(pdf, 0, 170, 651.5))
        check("cell number drawn", region_contains(pdf, 0, "0835550199", 118, 724, 260, 740))
        check("email drawn", region_contains(pdf, 0, "thandiwe@example.co.za", 298, 724, 540, 740))
        check("address drawn", region_contains(pdf, 0, "Dutywa", 118, 743, 540, 759))
        check("address postal code drawn", region_contains(pdf, 0, "5050", 452, 762, 540, 778))

        # Page 2 (idx 1): postal block + Section B.
        check("postal address drawn", region_contains(pdf, 1, "Dutywa", 118, 55, 540, 71))
        check("province drawn", region_contains(pdf, 1, "Eastern Cape", 118, 88, 540, 103))
        check("rural tick", tick_present(pdf, 1, 364, 107.3))
        check("no urban tick", not tick_present(pdf, 1, 152, 107.3))
        check("next of kin name drawn", region_contains(pdf, 1, "Nomvula", 118, 198, 540, 205))
        check("B1 existing-business Yes tick", tick_present(pdf, 1, 413, 308.1))
        check("B1 No not ticked", not tick_present(pdf, 1, 496, 308.1))
        check("B2 training Yes tick", tick_present(pdf, 1, 413, 322.9))

        # Page 5 (idx 4): Section E block (existing business).
        check("E block business name on the line", region_contains(pdf, 4, "Thandiwe Poultry Enterprise", 108, 122, 540, 140))
        check("E block business type drawn", region_contains(pdf, 4, "Free-range", 113, 141, 540, 158))
        check("E block sector agro X", tick_present(pdf, 4, 365, 210.4 - 6, 12))
        check("E block tourism not ticked", not tick_present(pdf, 4, 365, 323.4 - 6, 12))
        check("E block entity pty X", tick_present(pdf, 4, 185, 429.9))

        # Page 9 (idx 8): Section F grant block (always filled).
        check("F block business name", region_contains(pdf, 8, "Thandiwe Poultry Enterprise", 124, 355, 540, 372))
        check("F block sector agro X", tick_present(pdf, 8, 365, 448.4 - 6, 12))
        check("F block entity pty X", tick_present(pdf, 8, 185, 645.8))
        check("grant amount grouped right of R", region_contains(pdf, 8, "120 000", 191, 745, 540, 762))

        # Page 10 (idx 9): utilisation table.
        check("utilisation line 1 description", region_contains(pdf, 9, "Layer hens", 68, 46, 440, 64))
        check("utilisation line 1 amount", region_contains(pdf, 9, "80 000", 448, 46, 540, 64))
        check("utilisation line 2 description", region_contains(pdf, 9, "Feed", 68, 61, 440, 79))
        check("computed total 120 000", region_contains(pdf, 9, "120 000", 448, 124, 540, 141))

        # Page 11 (idx 10): Section G checklist + declaration.
        check("checklist item 1 tick", tick_present(pdf, 10, 348, 202.3))
        check("checklist item 7 tick (business plan)", tick_present(pdf, 10, 250, 293.1))
        check("checklist item 9 not ticked", not tick_present(pdf, 10, 257, 323.4))
        check("declaration signature area untouched",
              not region_contains(pdf, 10, "Thandiwe", 40, 700, 540, 790) and
              not region_contains(pdf, 10, "Nomvula", 40, 700, 540, 790))

        # Branch-use boxes on page 1 stay blank.
        check("branch-use GR/BCS row untouched", not region_contains(pdf, 0, "Mokoena", 240, 252, 540, 272))

    print("-- NYDA (start-up variant) --")
    with pdfplumber.open(f"{WORK}/filled-nyda-startup.pdf") as pdf:
        check("D block (page 3) business name drawn", region_contains(pdf, 2, "Thandiwe Poultry Enterprise", 124, 403, 540, 420))
        check("D block business type drawn", region_contains(pdf, 2, "Free-range", 131, 421, 540, 438))
        check("D block sector agro X", tick_present(pdf, 2, 365, 496.7 - 6, 12))
        check("D block entity pty X", tick_present(pdf, 2, 221, 716.3))
        check("E block (page 5) stays blank for a start-up", not region_contains(pdf, 4, "Thandiwe", 108, 122, 540, 140))
        check("F block (page 9) still filled for a start-up", region_contains(pdf, 8, "Thandiwe Poultry Enterprise", 124, 355, 540, 372))


def sefa_checks():
    print("-- ECRDA / sefa blended finance --")
    with pdfplumber.open(f"{WORK}/filled-sefa.pdf") as pdf:
        # Page 1 (idx 0): Section A.
        check("CIPC name drawn", region_contains(pdf, 0, "Mokoena Agri Processing", 203, 222, 550, 240))
        check("trading name drawn", region_contains(pdf, 0, "Mokoena Agri", 203, 238, 550, 254))
        check("type of business drawn", region_contains(pdf, 0, "Vegetable", 203, 253, 370, 269))
        check("industry drawn", region_contains(pdf, 0, "Agriculture", 465, 253, 550, 269))
        check("registration number drawn", region_contains(pdf, 0, "2022/111222/07", 203, 268, 370, 284))
        check("physical address drawn", region_contains(pdf, 0, "Dutywa", 203, 313, 550, 330))
        check("physical province drawn", region_contains(pdf, 0, "Eastern Cape", 251, 329, 374, 345))
        check("physical code drawn", region_contains(pdf, 0, "5050", 465, 329, 550, 345))
        check("district drawn in its narrow cell", region_contains(pdf, 0, "Amathole", 203, 378, 250, 392))
        check("local municipality drawn", region_contains(pdf, 0, "Mbhashe", 376, 378, 550, 392))
        check("years trading drawn", region_contains(pdf, 0, "3", 203, 412, 250, 433))
        check("employees drawn", region_contains(pdf, 0, "6", 376, 412, 550, 433))
        check("new jobs drawn", region_contains(pdf, 0, "4", 203, 434, 550, 450))
        check("correspondence email tick", tick_present(pdf, 0, 425, 473.5))
        check("no post tick", not tick_present(pdf, 0, 285, 473.5))
        check("no collect tick", not tick_present(pdf, 0, 203, 473.5))
        check("title Mr tick", tick_present(pdf, 0, 422, 541.5))
        check("contact surname drawn", region_contains(pdf, 0, "Mokoena", 203, 554, 550, 572))
        check("contact cell drawn", region_contains(pdf, 0, "0835550188", 251, 583, 374, 600))
        check("equipment amount right of R", region_contains(pdf, 0, "450 000", 212, 662, 550, 678))
        check("vegetables amount", region_contains(pdf, 0, "150 000", 212, 708, 550, 724))
        check("working capital amount", region_contains(pdf, 0, "100 000", 212, 785, 550, 801))
        check("computed total 700 000", region_contains(pdf, 0, "700 000", 212, 816, 550, 832))

        # Page 2 (idx 1): Section B + signatures.
        check("owner surname drawn", region_contains(pdf, 1, "Mokoena", 193, 140, 550, 152))
        check("owner ID drawn", region_contains(pdf, 1, "8502105600083", 193, 167, 550, 183))
        check("gender male tick", tick_present(pdf, 1, 227, 183.5))
        check("no female tick", not tick_present(pdf, 1, 307, 183.5))
        check("nationality drawn", region_contains(pdf, 1, "South African", 400, 187, 550, 198))
        check("race drawn in its narrow cell", region_contains(pdf, 1, "Black", 193, 201, 256, 212))
        check("disability No tick", tick_present(pdf, 1, 399, 201.5, 8))
        check("owner role drawn", region_contains(pdf, 1, "Managing", 193, 216, 550, 228))
        check("owner physical address wrapped", region_contains(pdf, 1, "Dutywa", 193, 258, 428, 292))
        check("signatory printed name drawn", region_contains(pdf, 1, "Sipho Mokoena", 198, 750, 550, 766))
        check("signatory designation drawn", region_contains(pdf, 1, "Managing", 198, 765, 550, 781))
        check("place, date and signature rows carry nothing",
              not region_contains(pdf, 1, "Dutywa", 198, 780, 550, 830))

        # Page 3 (idx 2): Annexure 1 checklist.
        check("checklist item 1 tick in the Note column", tick_present(pdf, 2, 310, 196.1 - 5))
        check("checklist item 16 tick (36-month projections)", tick_present(pdf, 2, 310, 681.3 - 5))
        check("unticked item 13 has no mark", not tick_present(pdf, 2, 310, 603.4 - 5))


def main():
    nyda_checks()
    sefa_checks()
    print()
    if failed:
        print(f"POSITIONAL QA: {passed} passed, {failed} FAILED")
        for f in failures:
            print(f"  - {f}")
        sys.exit(1)
    print(f"POSITIONAL QA: {passed} passed, 0 failed - all marks land where measured")


if __name__ == "__main__":
    main()
