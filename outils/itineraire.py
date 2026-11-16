#!/usr/bin/env python3
"""Génère itineraire.html : liens GPS (Google Maps / Waze / Apple Plans) par groupe
de 10 arrêts, dans l'ordre optimisé d'un onglet « Tournée du … » de l'Excel.

Usage : python3 outils/itineraire.py data/Tournee_PostNL_Jupille.xlsx "Tournée du 14-11" 4020 4030
"""
import sys, re, html, json, pathlib, urllib.parse, openpyxl

src, onglet, *cps = sys.argv[1:]
cps = set(cps or ["4020", "4030"])
wb = openpyxl.load_workbook(src, data_only=True)
ws = wb[onglet]
titre = ws["A1"].value or onglet

# repère les colonnes depuis la ligne d'en-tête (ligne 4)
head = [str(c.value or "") for c in ws[4]]
col = lambda nom: next(i for i, h in enumerate(head) if h.startswith(nom))
c_ord, c_grp, c_adr = col("Ordre"), col("Groupe"), col("Adresse")
c_cp = next((i for i, h in enumerate(head) if h.startswith("Code postal")), None)
c_rem = next((i for i, h in enumerate(head) if h.startswith("Remarque")), None)

arrets, ecartes = [], []
for r in ws.iter_rows(min_row=5, values_only=True):
    if not isinstance(r[c_ord], int) or not r[c_adr]:
        continue
    brut = str(r[c_adr])
    cp = str(r[c_cp]) if c_cp is not None else (re.search(r"\b(4\d{3})\b", brut) or [None, "?"])[1]
    rem = (r[c_rem] if c_rem is not None else None) or ""
    if cp not in cps:
        ecartes.append(f"{brut} ({cp})"); continue
    adr = re.sub(r"\(.*?\)", "", brut)
    adr = re.sub(r"\s+bte\s+\S+", "", adr, flags=re.I).strip()
    if re.search(r"sans num|99999", brut, re.I) or not re.search(r"\d", adr):
        ecartes.append(f"{brut} – adresse sans numéro valable"); continue
    arrets.append({"n": r[c_ord], "g": r[c_grp], "aff": brut, "q": f"{adr}, {cp} Liège, Belgique", "rem": rem})

# groupes de 10 maximum (limite des liens Google Maps)
groupes = []
for a in arrets:
    if not groupes or len(groupes[-1]) == 10:
        groupes.append([])
    groupes[-1].append(a)

def gmaps(g):
    p = {"api": "1", "destination": g[-1]["q"], "travelmode": "driving"}
    if len(g) > 1:
        p["waypoints"] = "|".join(a["q"] for a in g[:-1])
    return "https://www.google.com/maps/dir/?" + urllib.parse.urlencode(p, safe="|,")

e = html.escape
cartes = []
for i, g in enumerate(groupes, 1):
    lis = "".join(
        f'<li><span class="n">{a["n"]}</span><span>{e(a["aff"])}'
        + (f'<br><small>⚠️ {e(a["rem"])}</small>' if a["rem"] else "")
        + f'</span><span class="mini"><a href="https://waze.com/ul?q={urllib.parse.quote(a["q"])}&navigate=yes">Waze</a>'
        f'<a href="https://maps.apple.com/?daddr={urllib.parse.quote(a["q"])}&dirflg=d">Plans</a></span></li>'
        for a in g)
    cartes.append(f'''<section class="grp" id="g{i}">
  <div class="tete"><b>Groupe {i}</b><span>Arrêts {g[0]["n"]} → {g[-1]["n"]} · {len(g)} adresses</span></div>
  <a class="go" href="{e(gmaps(g))}" data-g="{i}">▶ Lancer le groupe {i} dans Google Maps</a>
  <ol>{lis}</ol>
</section>''')

page = f'''<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Itinéraire tournée</title>
<meta name="theme-color" content="#111318">
<style>
:root{{--bg:#111318;--panel:#1b1e25;--txt:#f2f4f7;--mut:#9aa3b2;--orange:#ff6a13;--ok:#2ecc71;--line:#30363f}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--bg);color:var(--txt);font:16px/1.35 -apple-system,system-ui,sans-serif;
  padding:calc(12px + env(safe-area-inset-top)) 16px calc(24px + env(safe-area-inset-bottom))}}
h1{{font-size:20px;margin:4px 0}} p{{color:var(--mut);font-size:14px;margin:6px 0 14px}}
a{{color:var(--orange)}}
.grp{{background:var(--panel);border-radius:16px;padding:12px;margin-bottom:12px}}
.grp.fait{{opacity:.45}}
.tete{{display:flex;justify-content:space-between;align-items:baseline;gap:8px}}
.tete span{{color:var(--mut);font-size:13px}}
.go{{display:block;margin:10px 0 6px;background:var(--orange);color:#fff;text-decoration:none;text-align:center;
  font-weight:700;padding:14px;border-radius:12px}}
ol{{list-style:none;margin:0;padding:0}}
li{{display:flex;gap:8px;padding:7px 0;border-top:1px solid var(--line);font-size:14px;align-items:flex-start}}
li .n{{color:var(--mut);min-width:28px;font-weight:600}}
li small{{color:#f5b301}}
.mini{{margin-left:auto;display:flex;gap:8px;font-size:13px;white-space:nowrap}}
.ecart{{background:var(--panel);border-radius:12px;padding:10px 12px;font-size:13px;color:var(--mut)}}
.retour{{display:inline-block;margin-bottom:8px}}
</style></head><body>
<a class="retour" href="./">← Retour au scan</a>
<h1>{e(titre)}</h1>
<p>{len(arrets)} adresses ({", ".join(sorted(cps))}) en {len(groupes)} groupes de 10 au maximum, dans l'ordre optimisé de la liste.
Touchez « Lancer » : Google Maps part de votre position et enchaîne les arrêts du groupe. Les groupes déjà lancés sont grisés.</p>
{"".join(cartes)}
{f'<div class="ecart"><b>Non incluses :</b><br>' + "<br>".join(e(x) for x in ecartes) + "</div>" if ecartes else ""}
<script>
const K="itin-"+{json.dumps(onglet)};
let fait=[];try{{fait=JSON.parse(localStorage.getItem(K))||[]}}catch(e){{}}
const maj=()=>document.querySelectorAll(".grp").forEach(s=>s.classList.toggle("fait",fait.includes(s.id)));
document.querySelectorAll(".go").forEach(a=>a.addEventListener("click",()=>{{const id="g"+a.dataset.g;
  if(!fait.includes(id))fait.push(id);try{{localStorage.setItem(K,JSON.stringify(fait))}}catch(e){{}};setTimeout(maj,500)}}));
maj();
</script>
</body></html>
'''
out = pathlib.Path(__file__).resolve().parent.parent / "itineraire.html"
out.write_text(page, encoding="utf-8")
print(f"{len(arrets)} arrêts, {len(groupes)} groupes, {len(ecartes)} écartés -> {out}")
for x in ecartes: print("  écarté :", x)
