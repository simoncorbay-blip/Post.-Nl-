# Secteur Jupille – appli iPhone pour la tournée PostNL (4020)

Scanne l'adresse d'un colis avec la caméra de l'iPhone : l'appli affiche **en grand la lettre du secteur (A à I)**, le nom du secteur, le n° de passage, le conseil de livraison et les remarques/notes de la rue.

## Installer sur l'iPhone

1. Ouvrir l'adresse de l'appli dans **Safari** (voir « Mise en ligne » ci-dessous).
2. Bouton **Partager** → **Sur l'écran d'accueil** → **Ajouter**.
3. Lancer l'appli depuis l'icône orange, autoriser la caméra.
4. Premier scan avec du réseau (≈ 5 Mo téléchargés une seule fois) ; ensuite l'appli fonctionne aussi hors connexion.

## Utilisation

| Bouton | Effet |
|---|---|
| **📷 Scanner** | Lit le texte dans le rectangle et donne le secteur (bip quand c'est trouvé) |
| **Auto** | Scan continu : on présente les colis l'un après l'autre devant la caméra |
| **🖼️** | Prendre une photo / choisir une photo existante |
| Champ texte | Taper quelques lettres d'une rue (« poch », « speesen »…). Sur iPhone, l'icône « Scanner le texte » du clavier marche aussi |
| Onglet **Rues** | Toutes les rues par secteur, ajout d'une rue manquante, notes terrain (code porte, chien…) |

La reconnaissance tolère les fautes de lecture, les majuscules, les accents et les abréviations (Av., Cdt, Dr…), et ignore le code postal et la ville (« 4020 Liège » ne donne pas « Rue de Liège »).

Pour les rues longues qui traversent plusieurs secteurs (Bois de Breux, Charlemagne, Beyne, Fléron, Visé…), l'appli affiche l'avertissement de l'Excel.

## Mise en ligne (GitHub Pages, gratuit)

Sur GitHub : **Settings → Pages → Source : Deploy from a branch**, choisir la branche contenant l'appli et le dossier `/ (root)`, puis **Save**. L'adresse sera du type `https://<utilisateur>.github.io/<dépôt>/`.

## Mettre à jour la liste des rues

1. Modifier l'Excel `data/Tournee_PostNL_Jupille.xlsx` (y compris l'onglet « Rues à placer »).
2. Lancer `python3 outils/excel_vers_data.py data/Tournee_PostNL_Jupille.xlsx` (régénère `data.js`).
3. Pousser les fichiers sur GitHub. Dans `sw.js`, changer `secteur-v1` en `secteur-v2` pour forcer la mise à jour sur l'iPhone.

## Fichiers

- `index.html` – l'appli (interface, caméra, OCR Tesseract.js)
- `match.js` – moteur de reconnaissance des rues
- `data.js` – rues et secteurs (générés depuis l'Excel)
- `sw.js`, `manifest.json`, `icons/` – installation sur l'écran d'accueil et mode hors connexion
