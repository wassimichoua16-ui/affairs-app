#!/usr/bin/env python3
"""Assemble www/index.html pour l'application Affairs Dirigeants."""
import json, base64, pathlib
R = pathlib.Path(__file__).parent
app = (R/"src/app.html").read_text(encoding="utf-8")
logo = "data:image/png;base64," + base64.b64encode((R/"src/logo.png").read_bytes()).decode()
stores = json.dumps(json.loads((R/"src/magasins.json").read_text(encoding="utf-8")), ensure_ascii=False)
body = app.replace("LOGO_SRC", logo).replace("STORES_JSON", stores)
html = f"""<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#141414"><title>Affairs Dirigeants</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800&display=swap">
<script src="config.js"></script></head><body>
{body}
</body></html>
"""
(R/"www").mkdir(exist_ok=True)
(R/"www/index.html").write_text(html, encoding="utf-8")
cfg = R/"www/config.js"
if not cfg.exists():
    cfg.write_text('// Adresse du serveur d\'estimation, ex. "https://estimation.affairs.fr". Vide = mode démo.\nwindow.AFFAIRS_API = "";\n', encoding="utf-8")
(R/"apercu").mkdir(exist_ok=True)
(R/"apercu/affairs-dirigeants.html").write_text("<title>Affairs Dirigeants</title>\n" + body, encoding="utf-8")
print("www/index.html généré")
