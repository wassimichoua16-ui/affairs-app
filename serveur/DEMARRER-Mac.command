#!/bin/bash
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Installez Node.js depuis https://nodejs.org puis relancez."; open https://nodejs.org/fr; read; exit 1; }
(sleep 1.5; open http://localhost:3000) &
node server.js
