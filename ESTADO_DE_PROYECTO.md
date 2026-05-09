# Estado del Proyecto — Arqueros Analytics

## URLs en producción
- **Dashboard:** https://mostadata.github.io/arqueros-analytics/
- **Login:** https://mostadata.github.io/arqueros-analytics/login.html
- **Admin:** https://mostadata.github.io/arqueros-analytics/admin.html
- **Repo:** https://github.com/MostaData/arqueros-analytics
- **Actions:** https://github.com/MostaData/arqueros-analytics/actions

## Datos actuales (scrape 2026-05-08)
- 115 torneos | 1.854 arqueros | 156 clubes | 5.826 resultados

## Arquitectura del proyecto
```
archery-analytics/
├── index.html              ← Dashboard principal (Chart.js CDN)
├── login.html              ← Login con CTA a Instagram
├── admin.html              ← Panel técnico admin
├── assets/style.css        ← Dark theme, responsive, estilos tour
├── assets/app.js           ← Lógica dashboard: filtros, gráficos, tour, exportCSV
├── assets/auth.js          ← Auth: login, caché sesión, refresh de perfil en vivo
├── assets/admin.js         ← Estado de datos, validaciones, buscadores
├── assets/admin-users.js   ← Gestión de usuarios y accesos
├── data/raw-scrape.json    ← Caché incremental del scraper (NO borrar)
├── data/calendar.json      ← Lista torneos con metadatos
├── data/tournaments.json   ← Detalle por torneo
├── data/all-results.json   ← Resultados planos (tabla central)
├── data/archers-index.json ← Arqueros con stats calculadas
├── data/clubs-index.json   ← Clubes con stats agregadas
├── scripts/scrape.js       ← Scraper: axios + cheerio, incremental (ID 500–1200)
├── scripts/build-data.js   ← Builder: raw-scrape → 5 JSONs finales
├── supabase-setup.sql          ← Setup inicial de tablas
├── supabase-reset.sql          ← Reset completo (cuidado)
├── supabase-access-flags.sql   ← Migración: all_archers_access / all_clubs_access
├── supabase-migration-sections.sql ← Migración: section_access
├── supabase-refresh-profile.sql    ← ⚠ PENDIENTE EJECUTAR EN SUPABASE
└── .github/workflows/update-data.yml ← Cron diario 6am UTC + manual
```

## ⚠ Pendiente: ejecutar SQL en Supabase
El archivo `supabase-refresh-profile.sql` todavía NO fue ejecutado en Supabase.
Sin él, los bugs de caché de sesión (mabarzua / INVITADO) no quedan resueltos.

**Pasos:**
1. Ir al SQL Editor de Supabase
2. Pegar el contenido de `supabase-refresh-profile.sql` (10 líneas)
3. Ejecutar → listo

## Sistema de autenticación
- Tabla `app_users` (sin Supabase Auth nativo)
- Hash bcrypt vía `pgcrypto.crypt()`
- Sesión en `localStorage` con clave `aa_user_v6`
- En cada carga de página se refrescan los flags desde la DB (función `get_user_live_profile`)
- Roles: `admin` | `viewer`
- `section_access`: `archers` | `clubs` | `both`
- `all_archers_access` / `all_clubs_access`: flags de acceso completo en `app_users`
- Accesos individuales en tabla `user_archer_access` (archer_id o `club:id`)

## Funcionalidades implementadas

### Dashboard (index.html)
- **Resumen General** — KPIs, gráficos de actividad, disciplinas, top clubes, puntajes. Filtros: Disciplina + Club organizador
- **Arqueros** — buscador autocomplete, filtros División/Disciplina/Año, gráfico evolución multicolor por división, gráfico de podio, comparación vs categoría, historial completo
- **Clubes / Escuelas** — selector con buscador por nombre, actividad por año, divisiones, cards de arqueros con mini-podio, comparación multi-arquero
- **Torneos** — tabla paginada, filtros Disciplina + búsqueda de texto por club organizador
- **Rankings** — 4 tabs (mejor puntaje / más participaciones / más victorias / ranking clubes). Filtros: Disciplina + División + Género
- **Progreso y Tendencias** — promedio por año, participaciones por año, top 15 puntajes. Filtros: Disciplina + División + Género
- **Exportar** — CSV con filtros aplicados + link copiable

### Tour de onboarding
- Se activa automáticamente la primera vez que el usuario entra
- Cubre: buscador, filtros, gráfico evolución, podio, vs categoría, historial
- Botón "?" fijo en esquina inferior derecha para repetirlo en cualquier momento
- Pasos adaptativos: salta elementos no visibles (ej: search box oculto para viewer con 1 arquero)
- Tours por sección: Arqueros (6 pasos), Clubes (4 pasos), Rankings (3 pasos), Progreso (4 pasos)
- Clave localStorage: `aa_tour_v1`

### Modo viewer
- Oculta Resumen y controles de admin via CSS (`html.viewer-mode`)
- Acceso restringido por arquero individual o club
- Con 0 arqueros asignados: muestra "Sin acceso" en todas las secciones
- Con 1 arquero: navega directo sin buscador
- Con 2+ arqueros: muestra buscador filtrado por acceso
- Rankings y Progreso: bloqueados para viewers sin acceso asignado

### Branding
- Link a Instagram `@mostadata` en sidebar del dashboard (hover rosa)
- CTA "¿Querés tu usuario permanente?" en login con botón gradiente Instagram

## Panel Admin (admin.html)
- Estado de datos: conteos, última actualización
- Gestión de usuarios: crear, eliminar, cambiar contraseña
- Modal de acceso por usuario: arqueros individuales, por club, todos los arqueros, todos los clubes
- Los cambios de acceso toman efecto en el próximo page load del usuario (sin re-login)

## Scraper
- Rango: ID 500–1200, MAX_CONSECUTIVE_MISSES = 50
- Incremental: solo scrapea torneos nuevos o modificados
- Cron diario 6am UTC via GitHub Actions
- Trigger manual con `force_full_rescrape: true` para re-scrape completo

## Próximas funcionalidades
1. **Segmentación por cliente** — `scripts/segment.js` (genera paquete JSON para arquero/club específico)
2. **Paginación del calendario** — scrapear todas las páginas de `/calendario` para múltiples años
3. **Nombres completos de clubes** — los datos del scraper solo tienen siglas (CUDA, ONA, etc.); requiere mapeo manual o enriquecimiento

## Token GitHub
- Usuario: MostaData
- Token guardado en git remote del repo local
- Expira ~90 días desde 2026-05-04

## Cómo correr localmente
```bash
cd C:\Users\ElBarbas\Desktop\PROGRAMACION\archery-analytics\scripts
npm install
node scrape.js        # genera data/raw-scrape.json
node build-data.js    # genera los 5 JSONs finales
cd ..
python3 -m http.server 8080
# → http://localhost:8080
```
