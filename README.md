# Riftbound Vault

> Inventario, tracker de precios, editor de mazos y escáner móvil para [Riftbound](https://riftbound.leagueoflegends.com/), el TCG de League of Legends.

Aplicación web personal y open-source para coleccionistas de Riftbound TCG. Gestiona tu colección, sigue precios en TCGPlayer y Cardmarket, recibe notificaciones push cuando se cumpla una alerta, construye mazos validados según las reglas oficiales y escanea cartas con la cámara del móvil.

**No afiliada con ni respaldada por Riot Games.** Todas las cartas, imágenes y marcas son propiedad de Riot Games.

## Características

- **Autenticación multi-dispositivo** — login con email/contraseña vía Supabase Auth.
- **Inventario** — registra cartas con cantidad, condición, acabado (foil/normal), idioma (10 soportados incl. chino simplificado y tradicional), fecha y precio de adquisición.
- **Marcado "En venta"** — cualquier carta del inventario puede listarse para venta con precio propio. Página dedicada y badge visual en el grid.
- **Monitorización automática de listados** — al marcar una carta para venta, opcionalmente se crean dos alertas internas (sube/baja 5%) que te avisan por push si tu precio se queda fuera de mercado. Se archivan automáticamente cuando quitas la venta.
- **Tracker de precios granular** — TCGPlayer (USD) y Cardmarket (EUR) por **condición × idioma × país del vendedor × tipo (Pro/Powerseller)**. Verás el precio mínimo de un Near Mint en español de un Pro vendiendo desde España, todo desglosado.
- **Promedios temporales** — 1d, 7d, 30d disponibles cuando el proveedor los expone.
- **Editor de mazos con validación** — reglas oficiales (40 main, 12 runas, 3 battlefields, 0/8 sideboard, max 3 copias, dominios del Legend) verificadas en tiempo real.
- **Sets como entidad propia** — con `totalCards`, fecha de release y % de completitud por set en stats.
- **Escáner móvil con OCR + detección automática de foil** — código universal de Riftbound + fallback a OCR de nombre cuando falla. Heurística de análisis de imagen (varianza de saturación + reflejos especulares + pico de brillo) que pre-marca el checkbox "foil" con score de confianza, ~85% de acierto.
- **Notificaciones push** — VAPID + service worker. Funciona en Android desde el navegador, en iOS solo si instalas como PWA.
- **Estadísticas multi-dimensión** — set, rareza, dominio, idioma, acabado, valor en venta.
- **PWA instalable** y **open source MIT**.

## Stack

- **Next.js 14** (App Router) + TypeScript + Tailwind + componentes inspirados en shadcn
- **Postgres** vía **Supabase** (free tier es de sobra) + **Supabase Auth** + **Prisma** ORM
- **Recharts** para gráficos de precio
- **Tesseract.js** para OCR client-side
- **web-push** para notificaciones push (VAPID)
- **TCGCSV** + **cardmarket-api.com** como fuentes de precio
- **RiftScribe** + **Riftcodex** como fuentes de catálogo de cartas

## Despliegue paso a paso

### 1. Subir el código a GitHub

Descomprime el zip y desde dentro de la carpeta:

```bash
cd riftbound-vault
git init
git add .
git commit -m "Initial commit"
```

Ve a github.com → "New repository" → ponle nombre (ej. `riftbound-vault`) → no marques "Initialize with README" → Create:

```bash
git remote add origin https://github.com/TU-USUARIO/riftbound-vault.git
git branch -M main
git push -u origin main
```

### 2. Crear el proyecto en Supabase

Entra en [supabase.com](https://supabase.com) → "New Project" → ponle nombre, una contraseña fuerte para la BD (apúntala) y región **West Europe (eu-west-1)** o similar para baja latencia desde España.

Espera ~1 minuto a que termine el provisioning. Después necesitas estos valores:

**Database:**
- **DATABASE_URL** — Settings → Database → "Connection string" → pestaña **Transaction pooler** (puerto 6543). Copia y reemplaza `[YOUR-PASSWORD]` por tu contraseña.
- **DIRECT_URL** — la misma sección, pestaña **Session mode** (puerto 5432). Misma sustitución.

**API:**
- **NEXT_PUBLIC_SUPABASE_URL** — Settings → API → "URL" (formato `https://xxxxx.supabase.co`).
- **NEXT_PUBLIC_SUPABASE_ANON_KEY** — Settings → API → "anon public key" (empieza por `eyJ...`).

### 3. Configurar Supabase Auth

En tu proyecto de Supabase:

1. **Authentication → Providers → Email** → activa "Enable Email Sign Up". Para uso personal, **desactiva** "Confirm email" (te ahorras configurar SMTP).
2. **Authentication → URL Configuration** → en "Site URL" pon la URL de Vercel (o `http://localhost:3000` mientras desarrollas en local).
3. **Authentication → URL Configuration → Redirect URLs** → añade `https://tu-dominio.vercel.app/auth/callback` (y `http://localhost:3000/auth/callback` para desarrollo).

### 4. Generar VAPID keys para push notifications (opcional)

Si quieres notificaciones push:

```bash
npx web-push generate-vapid-keys
```

Te da una clave pública y otra privada. Guárdalas — las usas en el siguiente paso.

### 5. Configurar variables de entorno

```bash
cp .env.example .env
```

Edita `.env` con todos los valores anteriores. Lo más importante:

```env
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."
NEXT_PUBLIC_SUPABASE_URL="https://xxx.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJ..."

# Activa auth multi-dispositivo (true = exige login para todo)
NEXT_PUBLIC_REQUIRE_AUTH="true"

# Si quieres push:
NEXT_PUBLIC_VAPID_PUBLIC_KEY="B..."
VAPID_PRIVATE_KEY="..."
VAPID_SUBJECT="mailto:tu@email.com"
```

### 6. Crear las tablas y poblar el catálogo

```bash
npm install
npm run db:generate
npm run db:push       # crea las tablas en Supabase
npm run sync:cards    # descarga ~298 cartas de Origins, ~30s
npm run sync:prices   # primer snapshot de precios, ~10s
```

### 7. Probar en local

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000). Si `NEXT_PUBLIC_REQUIRE_AUTH=true`, te redirige a `/login`. Crea cuenta y entra.

### 8. Desplegar en Vercel

Entra en [vercel.com](https://vercel.com), regístrate con tu cuenta de GitHub. "Add New" → "Project" → elige tu repo → "Import".

Configuración:
- **Framework Preset:** Next.js (lo detecta solo)
- **Environment Variables:** copia las MISMAS de tu `.env`. Mínimo:
  - `DATABASE_URL`
  - `DIRECT_URL`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `NEXT_PUBLIC_REQUIRE_AUTH=true`
  - `TCGPLAYER_CATEGORY_ID=89`
  - Si usas push: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
  - Si usas Cardmarket: `CARDMARKET_API_KEY`

Click **Deploy**. Tarda ~2 minutos. Te da una URL tipo `https://riftbound-vault-xxx.vercel.app`.

**Importante:** vuelve a Supabase → Authentication → URL Configuration y actualiza "Site URL" y "Redirect URLs" con la URL definitiva de Vercel.

### 9. Sync automático nocturno (opcional pero recomendado)

En GitHub: tu repo → Settings → Secrets and variables → Actions → "New repository secret". Añade:
- `DATABASE_URL`
- `DIRECT_URL`
- `CARDMARKET_API_KEY` (si lo tienes)

El workflow en `.github/workflows/sync.yml` corre los precios cada día a las 04:00 UTC y refresca el catálogo los lunes. Trigger manual: Actions → "Daily price sync" → "Run workflow".

## Uso desde el móvil

Funciona en cualquier navegador moderno con HTTPS (Vercel da HTTPS automático):

- **Para escanear cartas:** abre la URL en Chrome/Safari móvil, ve a "Escanear", concede permiso de cámara, apunta al código inferior de la carta. Listo.
- **Para notificaciones push:** en Android funciona desde el navegador; en iOS necesitas instalar como PWA primero ("Compartir → Añadir a pantalla de inicio") porque Safari solo soporta push para PWAs instaladas.

## Manual de usuario

Para una guía visual paso a paso de todas las funciones, abre [`manual-usuario.html`](./manual-usuario.html) en tu navegador.

## Roadmap

- [x] **v0.1** — Inventario, sync de cartas, sync de precios, alertas, escáner OCR, stats, PWA
- [x] **v0.2** — Editor de mazos con validación de reglas Riftbound (40 + 12 + 3 + 0/8 sideboard)
- [x] **v0.3** — Multi-usuario con Supabase Auth + push notifications
- [x] **v0.4** — Marcado "en venta" con monitorización automática · precios granulares (condición/idioma/país/seller-type) · entidad CardSet · OCR fallback por nombre · idioma como atributo de inventario · detección automática de foil por análisis de imagen
- [ ] **v0.5** — Importar/exportar CSV
- [ ] **v0.5** — Browser de sets como sección propia
- [ ] **v0.5** — Modelo de visión real (TensorFlow.js) para llevar la detección de foil del 85% al >95%
- [ ] **v0.6** — Tasas de cambio FX en vivo (ahora se asume USD↔EUR fija)
- [ ] **v0.6** — Compartir mazos con URL pública

## Notas legales

- **Cartas y arte:** propiedad de Riot Games. Esta app no incluye assets — los referencia desde URLs públicas de RiftScribe / Riot CDN.
- **Riot API:** Riot tiene un programa oficial de API para apps de Riftbound. Para uso personal y open-source, las APIs comunitarias usadas aquí son la vía práctica. Si distribuyes la app o monetizas, **debes** solicitar un API key oficial.
- **Datos de meta:** Riot prohíbe explícitamente publicar "metagame-defining data" (winrates, % de juego de cartas). Esta app **no** rastrea nada de eso.
- **Cardmarket:** la API oficial está cerrada a nuevos registros. Esta app usa cardmarket-api.com (servicio de terceros con tier gratis de 100 req/día) cuando el usuario provee una key.

## Licencia

MIT — ver [LICENSE](LICENSE).
