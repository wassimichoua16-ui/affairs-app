#!/usr/bin/env python3
"""Assemble l'application : www/index.html (Capacitor) et l'aperçu en ligne."""
import json, base64, pathlib
R = pathlib.Path(__file__).parent
app = (R/"src/app.part").read_text(encoding="utf-8")
js = (R/"src/app.js.part").read_text(encoding="utf-8")
logo = "data:image/png;base64," + base64.b64encode((R/"src/logo.png").read_bytes()).decode()
stores = json.dumps(json.loads((R/"src/magasins.json").read_text(encoding="utf-8")), ensure_ascii=False)
body = app.replace("LOGO_SRC", logo)
js = js.replace("STORES_JSON", stores)
fonts = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800&display=swap">'

www = f"""<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#e30613">
<title>Affair's</title>
{fonts}
<script src="config.js"></script>
</head>
<body>
{body}
{js}
</body>
</html>
"""
(R/"www").mkdir(exist_ok=True)
(R/"www/index.html").write_text(www, encoding="utf-8")
cfg = R/"www/config.js"
if not cfg.exists():
    cfg.write_text('// Adresse de votre serveur d\'estimation, ex. "https://estimation.affairs.fr"\n// Laisser vide = mode démonstration (résultats fictifs).\nwindow.AFFAIRS_API = "";\n', encoding="utf-8")

preview = f"<title>Application Affair's</title>\n{fonts}\n{body}\n{js}\n"
(R/"apercu").mkdir(exist_ok=True)
(R/"apercu/application-affairs.html").write_text(preview, encoding="utf-8")
print("www/index.html et apercu/application-affairs.html générés")
