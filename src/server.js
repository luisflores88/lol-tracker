require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Configuración Riot API ──────────────────────────────────────────────────
const RIOT_API_KEY = process.env.RIOT_API_KEY;
const REGION = (process.env.RIOT_REGION || 'LA2').toUpperCase();

// Mapeo de regiones a rutas de API
const REGION_ROUTES = {
  BR1:  { platform: 'br1',  regional: 'americas' },
  EUN1: { platform: 'eun1', regional: 'europe'   },
  EUW1: { platform: 'euw1', regional: 'europe'   },
  JP1:  { platform: 'jp1',  regional: 'asia'     },
  KR:   { platform: 'kr',   regional: 'asia'     },
  LA1:  { platform: 'la1',  regional: 'americas' },
  LA2:  { platform: 'la2',  regional: 'americas' },
  NA1:  { platform: 'na1',  regional: 'americas' },
  OC1:  { platform: 'oc1',  regional: 'sea'      },
  TR1:  { platform: 'tr1',  regional: 'europe'   },
  RU:   { platform: 'ru',   regional: 'europe'   },
};

const { platform, regional } = REGION_ROUTES[REGION] || REGION_ROUTES['LA2'];

const RIOT_BASE      = `https://${platform}.api.riotgames.com`;
const RIOT_REGIONAL  = `https://${regional}.api.riotgames.com`;

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Rate limiting — Riot permite 20 req/s y 100 req/2min en dev keys
const limiter = rateLimit({
  windowMs: 10 * 1000, // 10 segundos
  max: 15,
  message: { error: 'Demasiadas solicitudes. Esperá unos segundos.' }
});
app.use('/api', limiter);

// Servir frontend estático
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── Helper: request a Riot ──────────────────────────────────────────────────
async function riotGet(url) {
  if (!RIOT_API_KEY || RIOT_API_KEY.includes('xxxxxxxx')) {
    throw new Error('API Key de Riot no configurada. Revisá el archivo .env');
  }
  const response = await axios.get(url, {
    headers: { 'X-Riot-Token': RIOT_API_KEY }
  });
  return response.data;
}

// ── Helper: obtener versión del parche ─────────────────────────────────────
let cachedVersion = null;
async function getPatchVersion() {
  if (cachedVersion) return cachedVersion;
  const versions = await axios.get('https://ddragon.leagueoflegends.com/api/versions.json');
  cachedVersion = versions.data[0];
  setTimeout(() => { cachedVersion = null; }, 3600 * 1000); // cache 1 hora
  return cachedVersion;
}

// ── Helper: obtener datos de todos los campeones ───────────────────────────
let cachedChampions = null;
async function getChampionData() {
  if (cachedChampions) return cachedChampions;
  const version = await getPatchVersion();
  const res = await axios.get(
    `https://ddragon.leagueoflegends.com/cdn/${version}/data/es_AR/champion.json`
  );
  // Crear mapa de championId -> data
  const map = {};
  for (const champ of Object.values(res.data.data)) {
    map[parseInt(champ.key)] = champ;
  }
  cachedChampions = map;
  setTimeout(() => { cachedChampions = null; }, 3600 * 1000);
  return cachedChampions;
}

// ── Helper: obtener datos de ítems ─────────────────────────────────────────
let cachedItems = null;
async function getItemData() {
  if (cachedItems) return cachedItems;
  const version = await getPatchVersion();
  const res = await axios.get(
    `https://ddragon.leagueoflegends.com/cdn/${version}/data/es_AR/item.json`
  );
  cachedItems = res.data.data;
  setTimeout(() => { cachedItems = null; }, 3600 * 1000);
  return cachedItems;
}

// ── Helper: obtener datos de runas ─────────────────────────────────────────
let cachedRunes = null;
async function getRuneData() {
  if (cachedRunes) return cachedRunes;
  const version = await getPatchVersion();
  const res = await axios.get(
    `https://ddragon.leagueoflegends.com/cdn/${version}/data/es_AR/runesReforged.json`
  );
  // Crear mapa runeId -> data
  const map = {};
  for (const tree of res.data) {
    map[tree.id] = { ...tree, type: 'tree' };
    for (const slot of tree.slots) {
      for (const rune of slot.runes) {
        map[rune.id] = { ...rune, type: 'rune', treeName: tree.name };
      }
    }
  }
  cachedRunes = map;
  setTimeout(() => { cachedRunes = null; }, 3600 * 1000);
  return cachedRunes;
}

// ── ENDPOINT: Buscar invocador por nombre ──────────────────────────────────
// Nuevo sistema: gameName#tagLine (Riot ID)
app.get('/api/summoner', async (req, res) => {
  try {
    const { name, tag } = req.query;

    if (!name) {
      return res.status(400).json({ error: 'Se requiere el parámetro name (y opcionalmente tag)' });
    }

    let puuid, summonerData, accountData;

    // Si tienen tag (formato Riot ID: nombre#tag)
    if (tag) {
      accountData = await riotGet(
        `${RIOT_REGIONAL}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`
      );
      puuid = accountData.puuid;
    }

    // Obtener summoner por PUUID o por nombre legacy
    if (puuid) {
      summonerData = await riotGet(`${RIOT_BASE}/lol/summoner/v4/summoners/by-puuid/${puuid}`);
    } else {
      // Búsqueda legacy por nombre (deprecada pero útil como fallback)
      summonerData = await riotGet(`${RIOT_BASE}/lol/summoner/v4/summoners/by-name/${encodeURIComponent(name)}`);
      puuid = summonerData.puuid;
    }

    // Obtener rango
    let rankData = [];
    try {
      rankData = await riotGet(`${RIOT_BASE}/lol/league/v4/entries/by-summoner/${summonerData.id}`);
    } catch (e) { /* puede no tener rango */ }

    const version = await getPatchVersion();
    const soloQueue = rankData.find(r => r.queueType === 'RANKED_SOLO_5x5');
    const flexQueue  = rankData.find(r => r.queueType === 'RANKED_FLEX_SR');

    res.json({
      id:            summonerData.id,
      accountId:     summonerData.accountId,
      puuid:         summonerData.puuid,
      name:          accountData?.gameName || summonerData.name,
      tag:           accountData?.tagLine || tag || platform.toUpperCase(),
      profileIconId: summonerData.profileIconId,
      summonerLevel: summonerData.summonerLevel,
      profileIconUrl: `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${summonerData.profileIconId}.png`,
      soloQueue:     soloQueue || null,
      flexQueue:     flexQueue || null,
      region:        REGION,
    });

  } catch (err) {
    console.error('[/api/summoner]', err.message);
    if (err.response?.status === 404) {
      return res.status(404).json({ error: 'Invocador no encontrado. Verificá el nombre y la región.' });
    }
    if (err.response?.status === 403) {
      return res.status(403).json({ error: 'API Key inválida o expirada. Renovála en developer.riotgames.com' });
    }
    res.status(500).json({ error: err.message });
  }
});

// ── ENDPOINT: Partida en curso ─────────────────────────────────────────────
app.get('/api/live-game', async (req, res) => {
  try {
    const { puuid } = req.query;
    if (!puuid) return res.status(400).json({ error: 'Se requiere puuid' });

    let gameData;
    try {
      gameData = await riotGet(`${RIOT_BASE}/lol/spectator/v5/active-games/by-summoner/${puuid}`);
    } catch (err) {
      if (err.response?.status === 404) {
        return res.status(404).json({ error: 'No hay partida en curso', code: 'NOT_IN_GAME' });
      }
      throw err;
    }

    const [champions, version, runes] = await Promise.all([
      getChampionData(),
      getPatchVersion(),
      getRuneData(),
    ]);

    // Enriquecer participantes con datos de campeón y rango
    const enrichedParticipants = await Promise.all(
      gameData.participants.map(async (p) => {
        const champ = champions[p.championId];

        // Obtener rango del participante
        let rank = null;
        try {
          const summ = await riotGet(`${RIOT_BASE}/lol/summoner/v4/summoners/by-puuid/${p.puuid}`);
          const rankInfo = await riotGet(`${RIOT_BASE}/lol/league/v4/entries/by-summoner/${summ.id}`);
          const soloQ = rankInfo.find(r => r.queueType === 'RANKED_SOLO_5x5');
          if (soloQ) {
            const wins = soloQ.wins;
            const total = wins + soloQ.losses;
            rank = {
              tier:    soloQ.tier,
              rank:    soloQ.rank,
              lp:      soloQ.leaguePoints,
              wins,
              losses:  soloQ.losses,
              winrate: total > 0 ? Math.round((wins / total) * 100) : 0,
            };
          }
        } catch(e) { /* sin rango */ }

        // Procesar runas
        const primaryRuneId = p.perks?.perkIds?.[0];
        const primaryRune = primaryRuneId ? runes[primaryRuneId] : null;
        const keystoneTree = p.perks?.perkStyle ? runes[p.perks.perkStyle] : null;

        return {
          puuid:        p.puuid,
          summonerName: p.summonerName || p.riotId || 'Invocador',
          teamId:       p.teamId,
          championId:   p.championId,
          championName: champ?.name || 'Desconocido',
          championKey:  champ?.id || 'Unknown',
          spell1Id:     p.spell1Id,
          spell2Id:     p.spell2Id,
          championIcon: champ
            ? `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${champ.id}.png`
            : null,
          rank,
          perks: {
            keystoneId:   primaryRuneId,
            keystoneName: primaryRune?.name || null,
            keystoneIcon: primaryRune?.icon
              ? `https://ddragon.leagueoflegends.com/cdn/img/${primaryRune.icon}`
              : null,
            treeIcon: keystoneTree?.icon
              ? `https://ddragon.leagueoflegends.com/cdn/img/${keystoneTree.icon}`
              : null,
          },
        };
      })
    );

    const team1 = enrichedParticipants.filter(p => p.teamId === 100);
    const team2 = enrichedParticipants.filter(p => p.teamId === 200);

    res.json({
      gameId:       gameData.gameId,
      gameMode:     gameData.gameMode,
      gameType:     gameData.gameType,
      gameQueueConfigId: gameData.gameQueueConfigId,
      gameLength:   gameData.gameLength,
      mapId:        gameData.mapId,
      team1,
      team2,
      bannedChampions: gameData.bannedChampions?.map(b => {
        const champ = champions[b.championId];
        return {
          ...b,
          championName: champ?.name || 'Desconocido',
          championKey:  champ?.id,
          icon: champ
            ? `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${champ.id}.png`
            : null,
        };
      }) || [],
    });

  } catch (err) {
    console.error('[/api/live-game]', err.message);
    if (err.response?.status === 403) {
      return res.status(403).json({ error: 'API Key inválida o expirada.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// ── ENDPOINT: Info de parche ───────────────────────────────────────────────
app.get('/api/patch', async (req, res) => {
  try {
    const version = await getPatchVersion();
    res.json({ version, region: REGION });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Fallback → index.html ──────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ── Arrancar servidor ──────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🎮 LoL Live Tracker corriendo en http://localhost:${PORT}`);
  console.log(`📡 Región: ${REGION} (${platform}.api.riotgames.com)`);
  console.log(`🔑 API Key: ${RIOT_API_KEY ? RIOT_API_KEY.substring(0, 12) + '...' : '❌ NO CONFIGURADA'}\n`);
});
