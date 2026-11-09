// Moteur de reconnaissance : retrouve la rue (et donc le secteur) dans un texte
// lu par OCR ou tapé à la main. Tolérant aux fautes de lecture.
(function (root) {
  // Abréviations ramenées à une forme unique (des deux côtés : texte et liste)
  const ABREV = {
    avenue: "av", ave: "av", commandant: "cdt", cmdt: "cdt", docteur: "dr",
    saint: "st", sainte: "ste", place: "pl", boulevard: "bd", bld: "bd",
    impasse: "imp", chaussee: "ch", chee: "ch",
  };
  const TYPES = new Set(["rue", "r", "av", "pl", "bd", "imp", "ch", "clos", "cite",
    "dreve", "thier", "allee", "chemin", "quai", "voie", "sentier", "square"]);
  const PARTICULES = new Set(["de", "du", "des", "la", "le", "l", "d", "les", "a", "au", "aux"]);
  // Noms qui sont aussi des noms de villes / communes : on exige le type de voie devant
  const AMBIGUS = new Set(["liege", "meuse", "fleron", "beyne", "vise", "jupille"]);

  function norm(s) {
    return (s || "")
      .toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/œ/g, "oe").replace(/æ/g, "ae")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => ABREV[w] || w);
  }

  function lev(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = new Array(n + 1), cur = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      cur[0] = i;
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1,
          prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      [prev, cur] = [cur, prev];
    }
    return prev[n];
  }
  const sim = (a, b) => 1 - lev(a, b) / Math.max(a.length, b.length, 1);

  // Prépare la liste des rues une fois pour toutes
  function preparer(rues) {
    return rues.map((r) => {
      const complet = norm(r.rue);
      // mots significatifs (sans type ni particules), à partir du nom principal
      let cle = norm(r.cle).filter((w) => !PARTICULES.has(w));
      if (!cle.length) cle = complet.filter((w) => !TYPES.has(w) && !PARTICULES.has(w));
      const type = TYPES.has(complet[0]) ? complet[0] : null;
      const ambigu = cle.length === 1 && AMBIGUS.has(cle[0]);
      return { ...r, _complet: complet, _cle: cle, _cleTxt: cle.join(" "), _type: type, _ambigu: ambigu };
    });
  }

  // Retire « 4020 Jupille-sur-Meuse », « 4020 Liège », etc. (code postal + ville)
  function retirerVille(mots) {
    const out = [];
    for (let i = 0; i < mots.length; i++) {
      if (/^\d{4}$/.test(mots[i]) && mots[i][0] === "4") {
        // saute la ville qui suit (jusqu'à 3 mots, ex. jupille sur meuse)
        let j = i + 1;
        if (j < mots.length && /^[a-z]+$/.test(mots[j])) {
          j++;
          if (mots[j] === "sur" && j + 1 < mots.length) j += 2;
          else if (mots[j - 1] === "beyne" && mots[j] === "heusay") j++;
        }
        i = j - 1;
        continue;
      }
      if (mots[i] === "belgique" || mots[i] === "belgium" || mots[i] === "be") continue;
      out.push(mots[i]);
    }
    return out;
  }

  // Similarité entre une fenêtre de mots du texte et la clé de la rue
  function scoreFenetre(fen, cle) {
    // compare mot à mot ET en bloc (l'OCR colle ou coupe parfois les mots)
    let s = 0;
    for (let k = 0; k < cle.length; k++) s += sim(fen[k] || "", cle[k]) * cle[k].length;
    const parMot = s / cle.reduce((t, w) => t + w.length, 0);
    const bloc = sim(fen.join(""), cle.join(""));
    return Math.max(parMot, bloc);
  }

  function trouverNumero(mots, apres) {
    for (let k = apres; k < Math.min(mots.length, apres + 3); k++) {
      const m = mots[k].match(/^(\d{1,4})([a-z]{0,3})$/);
      if (m && !(m[1].length === 4 && m[1][0] === "4")) return m[1] + (m[2] ? m[2].toUpperCase() : "");
    }
    return null;
  }

  function chercher(texte, base, max = 5) {
    const mots = retirerVille(norm(texte));
    if (!mots.length) return [];
    const res = [];
    for (const r of base) {
      const L = r._cle.length;
      let best = 0, pos = -1, typeAvant = false;
      // fenêtres de L-1 à L+1 mots (mots coupés / collés par l'OCR)
      for (let len = Math.max(1, L - 1); len <= L + 1; len++) {
        for (let i = 0; i + len <= mots.length; i++) {
          const fen = mots.slice(i, i + len).filter((w) => !PARTICULES.has(w));
          if (!fen.length) continue;
          let sc = scoreFenetre(fen, r._cle);
          // un mot très court ne doit pas « matcher » une longue clé
          if (fen.join("").length < r._cleTxt.replace(/ /g, "").length * 0.6) sc *= 0.7;
          // le type de voie juste avant (en sautant les particules) ?
          let k = i - 1;
          while (k >= 0 && PARTICULES.has(mots[k])) k--;
          const t = k >= 0 && (TYPES.has(mots[k]) || (r._type && sim(mots[k], r._type) >= 0.75));
          if (t) sc += 0.06;
          // type exact (Rue ≠ Place) : départage Rue/Place Gît-le-Coq, Rue/Place de Meuse
          if (k >= 0 && r._type && mots[k] === r._type) sc += 0.03;
          if (sc > best) { best = sc; pos = i + len; typeAvant = t; }
        }
      }
      // nom de ville seul (« Liège », « Meuse »…) : pénalisé, sauf saisie courte à la main
      if (r._ambigu && !typeAvant && mots.length > 2) best *= 0.6;
      if (best >= 0.72) res.push({ rue: r, score: Math.min(1, best), brut: best, numero: trouverNumero(mots, pos) });
    }
    res.sort((a, b) => b.brut - a.brut || b.rue._cleTxt.length - a.rue._cleTxt.length);
    // dédoublonne : garde une seule entrée par rue
    const vu = new Set();
    return res.filter((x) => !vu.has(x.rue.rue) && vu.add(x.rue.rue)).slice(0, max);
  }

  const api = { norm, preparer, chercher, sim };
  if (typeof module !== "undefined") module.exports = api; else root.Matcher = api;
})(this);
