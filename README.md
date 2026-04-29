# ⚔ LoL Live Tracker

Tracker de partidas en vivo de League of Legends. Buscás tu invocador, ves si estás en partida, y te muestra los 10 jugadores con sus campeones y rangos.

---

## Estructura del proyecto

```
lol-tracker/
├── src/
│   └── server.js          ← Backend Node.js + Express (proxy Riot API)
├── public/
│   ├── index.html         ← Frontend
│   ├── css/style.css
│   └── js/app.js
├── .env.example           ← Variables de entorno (copiá a .env)
├── Dockerfile             ← Para deploy con Docker
├── railway.json           ← Para deploy en Railway
├── render.yaml            ← Para deploy en Render
└── package.json
```

---

## Setup local

### 1. Clonar y dependencias
```bash
git clone <tu-repo>
cd lol-tracker
npm install
```

### 2. API Key de Riot
1. Entrá a https://developer.riotgames.com
2. Logueate con tu cuenta de LoL
3. En el dashboard, copiá tu **Development API Key** (dura 24 hs)
4. Para producción: registrá tu app y pedí una **Production API Key**

### 3. Variables de entorno
```bash
cp .env.example .env
```
Editá `.env`:
```
RIOT_API_KEY=RGAPI-tu-key-aqui
RIOT_REGION=LA2
PORT=3000
```

**Regiones disponibles:**
| Región | Código |
|--------|--------|
| Latinoamérica Sur | LA2 |
| Latinoamérica Norte | LA1 |
| Norteamérica | NA1 |
| Europa Oeste | EUW1 |
| Europa Nórdica/Este | EUN1 |
| Corea | KR |
| Brasil | BR1 |
| Japón | JP1 |

### 4. Correr
```bash
npm start
# o para desarrollo con hot reload:
npm run dev
```

Abrí http://localhost:3000

---

## Deploy en Railway (recomendado, gratis)

1. Pusheá el código a GitHub
2. Entrá a https://railway.app → **New Project** → **Deploy from GitHub**
3. Seleccioná el repo
4. En **Variables**, agregá:
   - `RIOT_API_KEY` = tu key
   - `RIOT_REGION` = LA2
5. Railway detecta automáticamente Node.js y lo deploya

**URL pública:** Railway te da una URL tipo `https://lol-tracker-xxx.up.railway.app`

---

## Deploy en Render (alternativa, gratis)

1. Pusheá a GitHub
2. https://render.com → **New Web Service** → conectá el repo
3. Build Command: `npm install`
4. Start Command: `node src/server.js`
5. En **Environment Variables**, agregá `RIOT_API_KEY` y `RIOT_REGION`

---

## Deploy con Docker

```bash
docker build -t lol-tracker .
docker run -p 3000:3000 \
  -e RIOT_API_KEY=RGAPI-xxx \
  -e RIOT_REGION=LA2 \
  lol-tracker
```

---

## Uso

1. Ingresá tu **Riot ID** → formato `NombreJugador` y tag `LA2` (o el tag que tengas)
2. Hacé click en **BUSCAR** → aparece tu perfil con rango
3. **Entrate a una partida en LoL**
4. Volvé a la página y hacé click en **VERIFICAR PARTIDA EN VIVO**
5. ¡Aparecen los 10 jugadores con campeones, rangos y winrates!

---

## Notas importantes

- La **Dev API Key** de Riot expira cada 24 horas. Para uso continuo, necesitás solicitar una **Production Key** en el portal de Riot.
- Riot tiene límites de rate: 20 requests/s y 100 requests/2min en dev keys.
- La búsqueda de partida en vivo puede tardar 15-30 segundos porque busca el rango de los 10 jugadores en paralelo.

---

## Stack

- **Backend**: Node.js + Express
- **Frontend**: HTML/CSS/JS vanilla (sin frameworks)
- **API**: Riot Games API v4/v5 + Data Dragon CDN
- **Deploy**: Railway / Render / Docker

---

*No afiliado con Riot Games. LoL y League of Legends son marcas registradas de Riot Games.*
