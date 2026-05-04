# Estado del Proyecto — Arqueros Analytics

## URLs en producción
- **Dashboard:** https://mostadata.github.io/arqueros-analytics/
- **Admin:** https://mostadata.github.io/arqueros-analytics/admin.html
- **Repo:** https://github.com/MostaData/arqueros-analytics
- **Actions:** https://github.com/MostaData/arqueros-analytics/actions

## Datos actuales (scrape 2026-05-04)
- 115 torneos | 1.854 arqueros | 156 clubes | 5.826 resultados

## Problema pendiente: torneos faltantes
Algunos torneos de noviembre (y posiblemente otros meses) no fueron scrapeados.

**Causas identificadas:**
1. `ID_RANGE_START = 800` en `scripts/scrape.js` — torneos con ID < 800 nunca se escanean
2. `MAX_CONSECUTIVE_MISSES = 20` — si hay un hueco de 20 IDs seguidos, el scan se detiene
3. El calendario `/calendario` solo muestra el año actual (paginado, solo 1ra página scrapeada)

## Acción de mañana: recuperar torneos faltantes

### Paso 1 — Editar `scripts/scrape.js` (2 líneas)
```js
// ANTES:
const ID_RANGE_START = 800;
const MAX_CONSECUTIVE_MISSES = 20;

// DESPUÉS:
const ID_RANGE_START = 500;
const MAX_CONSECUTIVE_MISSES = 50;
```

### Paso 2 — Commit y push
```bash
cd C:\Users\labor\archery-analytics
git add scripts/scrape.js
git commit -m "fix: ampliar rango de IDs para recuperar torneos faltantes"
git push
```

### Paso 3 — Forzar re-scrape completo desde GitHub Actions
- Ir a https://github.com/MostaData/arqueros-analytics/actions
- Clic en **"Actualizar Datos de Arqueros"**
- Clic en **"Run workflow"**
- En el campo `force_full_rescrape` escribir `true`
- Clic en **Run workflow**
- Esperar ~20-30 min (más lento por el rango ampliado)

## Próximas funcionalidades a desarrollar
1. **Segmentación por cliente** — script `scripts/segment.js` (genera paquete JSON para un arquero o club específico)
2. **Paginación del calendario** — scrapear todas las páginas de `/calendario` para múltiples años
3. **Versiones privadas** — repo separado por cliente con su propio GitHub Pages

## Arquitectura del proyecto
```
archery-analytics/
├── index.html              ← Dashboard principal (Chart.js CDN)
├── admin.html              ← Panel técnico
├── assets/style.css        ← Dark theme, responsive
├── assets/app.js           ← Lógica dashboard: filtros, gráficos, exportCSV
├── assets/admin.js         ← Estado de datos, validaciones, buscadores
├── data/raw-scrape.json    ← Cache incremental del scraper (NO borrar)
├── data/calendar.json      ← Lista torneos con metadatos
├── data/tournaments.json   ← Detalle por torneo
├── data/all-results.json   ← Resultados planos (tabla central)
├── data/archers-index.json ← Arqueros con stats calculadas
├── data/clubs-index.json   ← Clubes con stats agregadas
├── scripts/scrape.js       ← Scraper: axios + cheerio, incremental
├── scripts/build-data.js   ← Builder: raw-scrape → 5 JSONs finales
└── .github/workflows/update-data.yml ← Cron diario 6am UTC + manual
```

## Token GitHub (expira en ~90 días desde 2026-05-04)
- Usuario: MostaData
- Token guardado en git remote del repo local

## Cómo correr localmente
```bash
cd C:\Users\labor\archery-analytics\scripts
npm install
node scrape.js        # genera data/raw-scrape.json
node build-data.js    # genera los 5 JSONs finales
# Abrir index.html con servidor local:
cd ..
python3 -m http.server 8080
# → http://localhost:8080
```
