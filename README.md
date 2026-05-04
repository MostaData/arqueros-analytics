# 🎯 Arqueros Analytics

Dashboard de análisis de datos para tiro con arco, basado en datos de [arquerosonline.com.ar](https://arquerosonline.com.ar).

Funciona 100% gratis: GitHub Pages para el frontend + GitHub Actions para el scraping automático.

---

## ¿Qué hace esta app?

- Extrae automáticamente datos de torneos, resultados y arqueros desde arquerosonline.com.ar
- Los guarda como archivos JSON en este repositorio
- Muestra un dashboard analítico con KPIs, rankings, gráficos y progreso por arquero
- Se actualiza sola todos los días sin que tengas que hacer nada

---

## Paso 1 — Crear el repositorio en GitHub

1. Entrá a [github.com](https://github.com) y creá una cuenta si no tenés
2. Hacé clic en el botón verde **New** (o el ícono `+` arriba a la derecha → "New repository")
3. Completá:
   - **Repository name:** `arqueros-analytics` (o el nombre que quieras)
   - **Visibility:** `Public` ← importante para que GitHub Pages funcione gratis
   - NO tildes ninguna opción extra
4. Hacé clic en **Create repository**

---

## Paso 2 — Subir los archivos

### Opción A — Desde el navegador (más fácil)

1. Abrí tu repositorio recién creado en GitHub
2. Hacé clic en **uploading an existing file** (o arrastrá archivos al área central)
3. Subí **todos los archivos y carpetas** de este proyecto manteniendo la estructura:
   - `index.html`
   - `admin.html`
   - `assets/` (con style.css, app.js, admin.js)
   - `data/` (con los 5 JSON vacíos)
   - `scripts/` (con package.json, scrape.js, build-data.js)
   - `.github/workflows/update-data.yml`
4. Escribí un mensaje como "Primer commit" y hacé clic en **Commit changes**

> **Nota:** GitHub no permite subir carpetas directamente desde el navegador para repositorios nuevos. Si tenés problemas, usá la Opción B.

### Opción B — Con GitHub Desktop (recomendado para no-programadores)

1. Bajá e instalá [GitHub Desktop](https://desktop.github.com/)
2. Iniciá sesión con tu cuenta de GitHub
3. Hacé clic en **Clone a repository** → elegí tu repositorio recién creado
4. Copiá todos los archivos de este proyecto a la carpeta que te indica GitHub Desktop
5. En GitHub Desktop verás los cambios → escribí un mensaje → clic en **Commit to main**
6. Hacé clic en **Push origin**

---

## Paso 3 — Activar GitHub Pages

1. En tu repositorio, hacé clic en **Settings** (engranaje)
2. En el menú izquierdo, hacé clic en **Pages**
3. En "Source", elegí:
   - **Branch:** `main`
   - **Folder:** `/ (root)`
4. Hacé clic en **Save**
5. Esperá 1-2 minutos y aparecerá un link del tipo:
   `https://TU-USUARIO.github.io/arqueros-analytics/`

Ese es tu dashboard. Por ahora estará vacío porque todavía no corriste el scraper.

---

## Paso 4 — Ejecutar el scraper por primera vez

1. En tu repositorio, hacé clic en la pestaña **Actions**
2. Si ves un aviso amarillo que dice "Workflows aren't being run...", hacé clic en **I understand my workflows, go ahead and enable them**
3. En el menú izquierdo, hacé clic en **Actualizar Datos de Arqueros**
4. Hacé clic en el botón **Run workflow** (a la derecha)
5. Dejá todo como está y hacé clic en el botón verde **Run workflow**
6. Esperá 5-15 minutos. Verás un círculo amarillo que se convierte en verde cuando termina.
7. Recargá tu dashboard (`https://TU-USUARIO.github.io/arqueros-analytics/`)
8. ¡Ya deberías ver datos!

---

## Paso 5 — Actualización automática

Una vez configurado, el scraper corre automáticamente **todos los días a las 6am UTC** (3am Argentina) sin que tengas que hacer nada.

Cada vez que hay datos nuevos, GitHub hace un commit automático con el mensaje `data: actualización automática YYYY-MM-DD`.

---

## Cómo actualizar los datos manualmente

Cuando quieras forzar una actualización:

1. Ir a tu repositorio en GitHub
2. Clic en **Actions**
3. Clic en **Actualizar Datos de Arqueros**
4. Clic en **Run workflow** → **Run workflow**
5. Esperar que termine (círculo verde)

---

## Cómo revisar errores

Si el workflow falla (círculo rojo en Actions):

1. Hacé clic en el workflow fallido
2. Hacé clic en el job **update**
3. Expandí el paso que falló (los pasos se muestran como lista)
4. Leé el mensaje de error

**Errores comunes:**
- `Cannot read raw-scrape.json` → El scraper no pudo conectarse al sitio. Intentalo de nuevo más tarde.
- `npm install failed` → Problema de red en GitHub. Intentalo de nuevo.
- El sitio arquerosonline.com.ar cambió su estructura → Contactá al desarrollador.

---

## Cómo interpretar el dashboard

### Resumen General
- **KPIs** en la parte superior: totales de torneos, arqueros, clubes, participaciones
- **Gráficos**: actividad mensual, distribución por disciplina, top clubes
- **Torneos recientes**: los últimos 10 torneos con resultados

### Filtros globales (arriba a la derecha)
Podés filtrar todo el dashboard por **año**, **disciplina** y **zona**.

### Sección Arqueros
- Buscá cualquier arquero por nombre
- Verás: historial completo, gráfico de evolución, comparación vs promedio de categoría, KPIs por disciplina

### Sección Clubes
- Tabla ordenada por participaciones
- Cantidad de arqueros, torneos, victorias por división

### Sección Torneos
- Lista completa de torneos con filtros
- Podés filtrar por año, disciplina, zona y club organizador

### Sección Rankings
- 4 tipos de ranking: mejor puntaje, más participaciones, más victorias, ranking de clubes
- Filtrables por división y género

### Sección Progreso
- Promedio anual histórico
- Participaciones por año
- Top 15 mejores puntajes del período seleccionado

### Exportar
- Descargá cualquier selección filtrada como archivo CSV
- Copiá un link con los filtros aplicados para compartir

---

## Panel Técnico Admin (`admin.html`)

Accedé desde el link "⚙ Panel Técnico Admin" en la parte inferior del sidebar.

Muestra:
- Estado de cada archivo de datos (cuántos registros, cuándo fue actualizado)
- Validaciones de integridad (torneos sin resultados, puntajes anómalos, posibles duplicados)
- Buscador de arqueros y clubes con sus IDs internos
- Instrucciones de cómo ejecutar el scraper
- Preparación para versiones segmentadas por cliente

---

## Futuras versiones por cliente

Esta app está diseñada para poder generar versiones privadas más adelante.

**Cómo funcionará:**
1. Identificás el `archer_id` o `club_id` del cliente desde el Panel Admin
2. Ejecutás un script que genera un paquete de datos solo con su información
3. Ese paquete se sube a un repositorio GitHub separado
4. El cliente recibe una URL privada de su propio dashboard

**Importante:** Los filtros del dashboard principal no son privacidad real. Para vender versiones privadas se necesita generar paquetes separados.

---

## Tecnología usada

| Componente | Tecnología | Costo |
|---|---|---|
| Frontend | HTML + CSS + JS puro | Gratis |
| Gráficos | Chart.js (CDN) | Gratis |
| Hosting | GitHub Pages | Gratis |
| Scraper | Node.js + axios + cheerio | Gratis |
| CI/CD | GitHub Actions | Gratis |
| **Total** | | **$0** |

---

## Estructura de archivos

```
archery-analytics/
├── index.html              ← Dashboard principal (abrí este)
├── admin.html              ← Panel técnico admin
├── assets/
│   ├── style.css           ← Diseño visual
│   ├── app.js              ← Lógica del dashboard
│   └── admin.js            ← Lógica del panel admin
├── data/
│   ├── raw-scrape.json     ← Cache interna del scraper (no editar)
│   ├── calendar.json       ← Lista de torneos
│   ├── tournaments.json    ← Detalle de cada torneo
│   ├── all-results.json    ← Todos los resultados individuales
│   ├── archers-index.json  ← Todos los arqueros con estadísticas
│   └── clubs-index.json    ← Todos los clubes con estadísticas
├── scripts/
│   ├── package.json        ← Dependencias del scraper
│   ├── scrape.js           ← Scraper principal
│   └── build-data.js       ← Generador de JSON
└── .github/workflows/
    └── update-data.yml     ← Automatización diaria
```

---

## Preguntas frecuentes

**¿Con qué frecuencia se actualizan los datos?**
Todos los días a las 6am UTC. También podés forzarlo manualmente desde Actions.

**¿Puedo cambiar el horario de actualización?**
Sí. Editá el archivo `.github/workflows/update-data.yml` y cambiá la línea `cron: '0 6 * * *'`. Usá [crontab.guru](https://crontab.guru) para generar el horario.

**¿Qué pasa si el sitio arquerosonline.com.ar está caído?**
El scraper maneja el error y no modifica los datos existentes. Al día siguiente lo intenta de nuevo.

**¿Los datos históricos se pierden si corro el scraper de nuevo?**
No. El scraper es incremental: solo descarga torneos nuevos que no estaban en el caché. Los datos existentes se conservan.

**¿Funciona en celular?**
Sí. El dashboard es responsive y funciona en pantallas pequeñas.

**¿Puedo usar esto sin internet?**
No directamente desde GitHub Pages. Pero podés descargar todo el repositorio y abrirlo localmente con un servidor web simple.
