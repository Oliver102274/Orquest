import json
import re
from pathlib import Path

import pdfplumber

SOURCE = Path("data/sources/mdc_academic_programs.pdf")
OUTPUT = Path("data/mdc_program_catalog.json")

programs = []
seen = set()

with pdfplumber.open(SOURCE) as pdf:
    for page in pdf.pages:
        for table in page.extract_tables():
            for row in table[1:]:
                if not row or len(row) < 6:
                    continue

                award, cip, florida_cip, plan, name, soc = [
                    " ".join(str(value or "").split())
                    for value in row[:6]
                ]

                if not name or not plan:
                    continue

                if name.startswith("https://"):
                    continue

                if award.upper() == "AWARD TYPE":
                    continue

                soc_codes = []

                for code in re.findall(r"\d{6}", soc):
                    formatted = f"{code[:2]}-{code[2:]}"
                    if formatted not in soc_codes:
                        soc_codes.append(formatted)

                key = (plan, name)

                if key in seen:
                    continue

                seen.add(key)

                programs.append({
                    "name": name,
                    "award_type": award,
                    "cip_code": cip,
                    "florida_cip_code": florida_cip,
                    "plan_code": plan,
                    "soc_codes": soc_codes,
                    "source_url": "https://www.mdc.edu/academics/documents/academic-programs-cip.pdf",
                })

OUTPUT.write_text(
    json.dumps(programs, indent=2, ensure_ascii=False),
    encoding="utf-8",
)

print("Programs extracted:", len(programs))
print("Programs with SOC codes:", sum(bool(p["soc_codes"]) for p in programs))
print("Saved to:", OUTPUT)

print("\nExample programs:")
for program in programs[:5]:
    print(program["name"], "=>", program["soc_codes"])
