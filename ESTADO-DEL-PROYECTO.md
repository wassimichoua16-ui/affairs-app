# ESTADO DEL PROYECTO — Apps Affair's
_Actualizado el 30/09/2026_

## Qué está terminado
| Elemento | Estado | Dónde |
|---|---|---|
| **App clientes « Affair's »** (info del sitio, estimación IA, elección de tienda, catálogo → affairs.fr) | ✅ Código finalizado, **sin modo demo** | raíz del repo (`src/`, `www/`) |
| **App privada « Affairs Dirigeants »** (estimaciones en tiempo real, seguimiento, estadísticas por tienda, estimación interna, márgenes) | ✅ Terminada (demo hasta conectar el servidor) | `dirigeants/` |
| **Servidor de estimación** (IA: foto → modelo → búsqueda de precios en Internet → recompra ; espacio gerente) | ✅ Listo para ponerse en línea | `serveur/` + `render.yaml` |
| **Fabricación automática de las APK** en GitHub | ✅ Funciona | `.github/workflows/` |

## Lo que falta (solo tú puedes hacerlo)
1. **Clave de IA** en https://console.anthropic.com (crédito 10–20 € + límite de gasto) → clave `sk-ant-…`
2. **Servidor en línea en un clic**: https://render.com/deploy?repo=https://github.com/wassimichoua16-ui/affairs-app
   - `ANTHROPIC_API_KEY` = tu clave · `GERANT_PASSWORD` = contraseña de dirección
   - Copiar la dirección Render (ej. `https://affairs-estimation.onrender.com`)
3. **Dar esa dirección a Claude** → la escribe en `adresse-serveur.txt`, y las dos APK definitivas se generan conectadas.

Detalle paso a paso: `PUESTA-EN-LINEA.txt`.

## Enlaces de descarga (se actualizan solos en cada fabricación)
- App clientes: https://github.com/wassimichoua16-ui/affairs-app/releases/download/app/Affairs.apk _(disponible cuando el servidor esté conectado)_
- Affairs Dirigeants: https://github.com/wassimichoua16-ui/affairs-app/releases/download/dirigeants/Affairs-Dirigeants.apk

## Pendiente antes de publicar en las tiendas
- Poner este repositorio en **privado** (Settings › Danger Zone › Change visibility).
- Sustituir el icono provisional por el **logo oficial en alta definición** (`assets/`).
- Completar la página **Confidencialidad** (conservación de datos) y ponerla en affairs.fr.
- Harmonizar « Satisfait ou remboursé 15 jours » (web) y « 14 jours ouvrés » (CGV).
- Verificar el **acuerdo de la marca** Affair's si eres franquiciado.
- Publicación App Store / Play Store: `GUIDE-PUBLICATION.txt` y `FICHE-STORES.txt`.

## Para retomar con Claude en una conversación nueva
Copia y pega:
> Retoma mi proyecto de apps Affair's en el repositorio GitHub wassimichoua16-ui/affairs-app. Lee ESTADO-DEL-PROYECTO.md. La dirección de mi servidor es: https://…
