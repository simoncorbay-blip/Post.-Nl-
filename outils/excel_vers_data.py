#!/usr/bin/env python3
"""Regénère data.js à partir de l'Excel de la tournée.

Usage : python3 outils/excel_vers_data.py data/Tournee_PostNL_Jupille.xlsx
"""
import json, sys, pathlib, openpyxl

src = sys.argv[1] if len(sys.argv) > 1 else "data/Tournee_PostNL_Jupille.xlsx"
wb = openpyxl.load_workbook(src, data_only=True)

secteurs = {}
for r in wb["Résumé secteurs"].iter_rows(min_row=4, values_only=True):
    if r[1] and isinstance(r[0], int) and r[2]:
        secteurs[r[1]] = {"nom": r[2], "conseil": r[3]}

principal = {}
for r in wb["Ordre alphabétique"].iter_rows(min_row=5, values_only=True):
    if r[0] and r[1]:
        principal[r[1]] = r[0]

rues = []
for r in wb["Ordre de passage"].iter_rows(min_row=5, values_only=True):
    if r[0] is None or not r[3]:
        continue
    rues.append({
        "n": r[0], "s": r[1], "rue": r[3], "cle": principal.get(r[3], r[3]),
        "rem": r[5] or "", "notes": r[6] or "", "cp": "4020",
    })

# Onglets complémentaires (même format) : N° de passage, Secteur, Nom du secteur,
# Rue, Code postal, Profil / conseil, Remarque, Notes terrain
for onglet in ("Médiacité – Grivegnée", "Beyne-Heusay"):
    if onglet not in wb.sheetnames:
        continue
    for r in wb[onglet].iter_rows(min_row=5, values_only=True):
        if not r[1] or not r[3]:
            continue
        s = str(r[1]).strip().upper()
        secteurs.setdefault(s, {"nom": r[2] or s, "conseil": r[5] or ""})
        rues.append({"n": r[0], "s": s, "rue": r[3], "cle": r[3], "rem": r[6] or "",
                     "notes": r[7] or "", "cp": str(r[4] or "")})

if "Rues à placer" in wb.sheetnames:
    for r in wb["Rues à placer"].iter_rows(min_row=5, values_only=True):
        if r[0] and r[1]:
            rues.append({"n": None, "s": str(r[1]).strip().upper(), "rue": r[0],
                         "cle": r[0], "rem": "Ajoutée (Rues à placer)", "notes": r[2] or ""})

out = pathlib.Path(__file__).resolve().parent.parent / "data.js"
out.write_text(
    "// Fichier généré par outils/excel_vers_data.py — ne pas modifier à la main\n"
    "window.SECTEURS = " + json.dumps(secteurs, ensure_ascii=False, indent=1) + ";\n"
    "window.RUES = " + json.dumps(rues, ensure_ascii=False, indent=1) + ";\n",
    encoding="utf-8")
print(f"{len(rues)} rues, {len(secteurs)} secteurs -> {out}")
