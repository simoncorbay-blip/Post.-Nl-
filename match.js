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
    "dreve", "thier", "allee", "chemin", "quai", "voie", "sentier", "square", "waide", "voisinage"]);
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
      if (cle.length > 1 && TYPES.has(cle[0])) cle = cle.slice(1);   // « Rue de Bois de Breux » → « bois breux »
      if (!cle.length) cle = complet.filter((w) => !TYPES.has(w) && !PARTICULES.has(w));
      const type = TYPES.has(complet[0]) ? complet[0] : null;
      const ambigu = cle.length === 1 && AMBIGUS.has(cle[0]);
      return { ...r, _complet: complet, _cle: cle, _cleTxt: cle.join(" "), _type: type, _ambigu: ambigu };
    });
  }

  // Localités → code postal (pour départager une même rue dans deux communes)
  const LOCALITES = { jupille: "4020", bressoux: "4020", wandre: "4020", beyne: "4610", heusay: "4610", bellaire: "4610", queue: "4610", grivegnee: "4030" };
  const VILLE = new Set(["jupille", "sur", "meuse", "liege", "beyne", "heusay", "bellaire", "bressoux",
    "wandre", "fleron", "herstal", "chenee", "grivegnee", "queue", "lez"]);

  // Retire « 4020 Jupille-sur-Meuse », « 4610 Beyne-Heusay », « 4610 Queue-du-Bois »…
  // et note le code postal trouvé (4020, 4610).
  function retirerVille(mots) {
    const out = [];
    let cp = null;
    for (let i = 0; i < mots.length; i++) {
      if (/^\d{4}$/.test(mots[i]) && mots[i][0] === "4") {
        if (["4020", "4030", "4610"].includes(mots[i])) cp = mots[i];
        let j = i + 1;
        while (j < mots.length && j < i + 4) {
          if (VILLE.has(mots[j])) {
            if (!cp && LOCALITES[mots[j]]) cp = LOCALITES[mots[j]];
            if (mots[j] === "queue" && mots[j + 1] === "du" && mots[j + 2] === "bois") j += 2;
            j++;
          } else break;
        }
        i = j - 1;
        continue;
      }
      if (mots[i] === "belgique" || mots[i] === "belgium" || mots[i] === "be") continue;
      out.push(mots[i]);
    }
    return { mots: out, cp };
  }

  // Similarité entre une fenêtre de mots du texte et la clé de la rue
  // une initiale (« R. ») vaut le prénom complet (« Raymond »)
  const simMot = (f, c) => (f.length === 1 && c.length > 1 && f === c[0] ? 1 : sim(f, c));

  function scoreFenetre(fen, cle, sansPrenom = true) {
    // compare mot à mot ET en bloc (l'OCR colle ou coupe parfois les mots)
    let s = 0;
    for (let k = 0; k < cle.length; k++) s += (k < cle.length - 1 ? simMot : sim)(fen[k] || "", cle[k]) * cle[k].length;
    const parMot = s / cle.reduce((t, w) => t + w.length, 0);
    const bloc = sim(fen.join(""), cle.join(""));
    let sc = Math.max(parMot, bloc);
    // un mot très court ne doit pas « matcher » une longue clé
    if (fen.join("").length < cle.join("").length * 0.6 && !fen.some((w) => w.length === 1)) sc *= 0.7;
    // prénom omis : « Bd Poincaré » pour « Boulevard Raymond Poincaré »
    if (sansPrenom && cle.length >= 2 && fen.length === cle.length - 1 && cle[cle.length - 1].length >= 5)
      sc = Math.max(sc, scoreFenetre(fen, cle.slice(1), false) * 0.95);
    return sc;
  }

  function trouverNumero(mots, apres) {
    for (let k = apres; k < Math.min(mots.length, apres + 3); k++) {
      const m = mots[k].match(/^(\d{1,4})([a-z]{0,3})$/);
      if (m && !(m[1].length === 4 && m[1][0] === "4")) return m[1] + (m[2] ? m[2].toUpperCase() : "");
    }
    return null;
  }

  function chercher(texte, base, max = 5) {
    const { mots, cp } = retirerVille(norm(texte));
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
          // le type de voie juste avant (en sautant les particules) ?
          let k = i - 1;
          while (k >= 0 && PARTICULES.has(mots[k])) k--;
          const t = k >= 0 && (TYPES.has(mots[k]) || (r._type && sim(mots[k], r._type) >= 0.65));
          if (t) sc += 0.06;
          // type exact (Rue ≠ Place) : départage Rue/Place Gît-le-Coq, Rue/Place de Meuse
          if (k >= 0 && r._type && mots[k] === r._type) sc += 0.03;
          if (sc > best) { best = sc; pos = i + len; typeAvant = t; }
        }
      }
      // nom de ville seul (« Liège », « Meuse »…) : pénalisé, sauf saisie courte à la main
      if (r._ambigu && !typeAvant && mots.length > 2) best *= 0.6;
      // nom d'un seul mot sans « Rue » devant (Louis, Billy, Gilon…) : peut être un nom de personne
      else if (L === 1 && !typeAvant && mots.length > 2) best *= 0.85;
      // code postal lu sur l'étiquette : favorise la bonne commune
      if (cp && r.cp && best >= 0.72) best += r.cp === cp ? 0.05 : -0.05;
      if (best >= 0.72) res.push({ rue: r, score: Math.min(1, best), brut: best, numero: trouverNumero(mots, pos) });
    }
    res.sort((a, b) => b.brut - a.brut || b.rue._cleTxt.length - a.rue._cleTxt.length);
    // dédoublonne : garde une seule entrée par rue
    const vu = new Set();
    return res.filter((x) => { const k = x.rue.rue + "|" + (x.rue.cp || ""); return !vu.has(k) && vu.add(k); }).slice(0, max);
  }

  const api = { norm, preparer, chercher, sim };
  if (typeof module !== "undefined") module.exports = api; else root.Matcher = api;
})(this);
