/* ============================================================
   LoL Live Tracker — Frontend JS
   ============================================================ */

// Estado global
let currentSummoner = null;

const QUEUE_NAMES = {
  420: 'Solo/Duo Rankeado',
  440: 'Flex 5v5 Rankeado',
  400: 'Normal (Draft)',
  430: 'Normal (Ciego)',
  450: 'ARAM',
  700: 'Clash',
  900: 'URF',
  1020: 'One For All',
  1300: 'Nexus Blitz',
  1400: 'Modo Definitivo',
  1900: 'URF (Rotación)',
  0:   'Personalizada',
};

const TIER_ORDER = ['IRON','BRONZE','SILVER','GOLD','PLATINUM','EMERALD','DIAMOND','MASTER','GRANDMASTER','CHALLENGER'];

// ── Init ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadPatchInfo();

  // Enter en el campo de nombre
  document.getElementById('summonerName').addEventListener('keydown', e => {
    if (e.key === 'Enter') searchSummoner();
  });
  document.getElementById('summonerTag').addEventListener('keydown', e => {
    if (e.key === 'Enter') searchSummoner();
  });
});

// ── Cargar info del parche ──────────────────────────────────────────────────
async function loadPatchInfo() {
  try {
    const data = await apiFetch('/api/patch');
    document.getElementById('patchVersion').textContent = `Parche ${data.version}`;
    document.getElementById('regionLabel').textContent = data.region;
    document.getElementById('summonerTag').placeholder = data.region;
  } catch (e) {
    document.getElementById('patchVersion').textContent = 'Sin conexión';
  }
}

// ── Buscar invocador ────────────────────────────────────────────────────────
async function searchSummoner() {
  const name = document.getElementById('summonerName').value.trim();
  const tag  = document.getElementById('summonerTag').value.trim();

  if (!name) {
    showError('Ingresá tu nombre de invocador.');
    return;
  }

  hideError();
  hideSummonerCard();
  hideLiveGame();
  showLoading('Buscando invocador...');
  setSearchBtnLoading(true);

  try {
    const params = tag ? `?name=${encodeURIComponent(name)}&tag=${encodeURIComponent(tag)}` : `?name=${encodeURIComponent(name)}`;
    const data = await apiFetch(`/api/summoner${params}`);
    currentSummoner = data;
    showSummonerCard(data);
  } catch (err) {
    showError(err.message || 'Error al buscar el invocador.');
  } finally {
    hideLoading();
    setSearchBtnLoading(false);
  }
}

// ── Verificar partida en vivo ────────────────────────────────────────────────
async function checkLiveGame() {
  if (!currentSummoner) return;

  hideLiveGame();
  showLoading('Buscando partida en vivo...');

  const btn = document.getElementById('liveBtn');
  btn.disabled = true;

  try {
    const data = await apiFetch(`/api/live-game?puuid=${encodeURIComponent(currentSummoner.puuid)}`);
    showLiveGame(data, currentSummoner.puuid);
  } catch (err) {
    if (err.code === 'NOT_IN_GAME') {
      showError('❌ No estás en partida en este momento. ¡Entrá a una partida y volvé a intentar!');
    } else {
      showError(err.message || 'Error al buscar la partida.');
    }
  } finally {
    hideLoading();
    btn.disabled = false;
  }
}

// ── Render: Summoner Card ───────────────────────────────────────────────────
function showSummonerCard(summoner) {
  document.getElementById('summonerIcon').src = summoner.profileIconUrl;
  document.getElementById('summonerIcon').alt = summoner.name;
  document.getElementById('summonerLevel').textContent = `Nv. ${summoner.summonerLevel}`;
  document.getElementById('summonerNameDisplay').textContent =
    summoner.tag ? `${summoner.name} #${summoner.tag}` : summoner.name;

  const ranksEl = document.getElementById('summonerRanks');
  ranksEl.innerHTML = '';

  const renderRank = (queue, label) => {
    if (!queue) return `
      <div class="rank-chip">
        <span class="rank-label">${label}</span>
        <span class="rank-unranked">Sin rankear</span>
      </div>`;
    const wr = queue.wins + queue.losses > 0
      ? Math.round(queue.wins / (queue.wins + queue.losses) * 100)
      : 0;
    return `
      <div class="rank-chip">
        <span class="rank-label">${label}</span>
        <span class="rank-value tier-${queue.tier}">${queue.tier} ${queue.rank}</span>
        <span class="rank-lp">${queue.lp} LP</span>
        <span class="rank-wr">WR ${wr}%</span>
      </div>`;
  };

  ranksEl.innerHTML =
    renderRank(summoner.soloQueue, 'SOLO') +
    renderRank(summoner.flexQueue,  'FLEX');

  document.getElementById('summonerCard').style.display = '';
}

function hideSummonerCard() {
  document.getElementById('summonerCard').style.display = 'none';
}

// ── Render: Live Game ───────────────────────────────────────────────────────
function showLiveGame(game, myPuuid) {
  const gameEl = document.getElementById('liveGame');

  // Info bar
  const queueName = QUEUE_NAMES[game.gameQueueConfigId] || `Cola ${game.gameQueueConfigId}`;
  const duration  = game.gameLength > 0 ? formatDuration(game.gameLength) : 'Cargando...';
  document.getElementById('gameInfoBar').innerHTML = `
    <div class="info-chip">
      <span class="info-chip-label">MODO</span>
      <span class="info-chip-value">${queueName}</span>
    </div>
    <span class="info-chip-sep">|</span>
    <div class="info-chip">
      <span class="info-chip-label">DURACIÓN</span>
      <span class="info-chip-value" id="gameDuration">${duration}</span>
    </div>
    <span class="info-chip-sep">|</span>
    <div class="info-chip">
      <span class="info-chip-label">JUGADORES</span>
      <span class="info-chip-value">${game.team1.length + game.team2.length}</span>
    </div>
  `;

  // Bans
  if (game.bannedChampions && game.bannedChampions.length > 0) {
    const bansEl = document.getElementById('bansSection');
    const blueBans = game.bannedChampions.filter(b => b.teamId === 100);
    const redBans  = game.bannedChampions.filter(b => b.teamId === 200);

    let bansHtml = '';

    if (blueBans.length) {
      blueBans.forEach(b => {
        bansHtml += renderBan(b, 'blue');
      });
      bansHtml += '<div class="ban-separator"></div>';
    }
    redBans.forEach(b => {
      bansHtml += renderBan(b, 'red');
    });

    document.getElementById('bansGrid').innerHTML = bansHtml;
    bansEl.style.display = '';
  }

  // Teams
  const team1El = document.getElementById('team1List');
  const team2El = document.getElementById('team2List');
  team1El.innerHTML = '';
  team2El.innerHTML = '';

  game.team1.forEach((p, i) => {
    team1El.insertAdjacentHTML('beforeend', renderPlayer(p, p.puuid === myPuuid, i));
  });
  game.team2.forEach((p, i) => {
    team2El.insertAdjacentHTML('beforeend', renderPlayer(p, p.puuid === myPuuid, i));
  });

  gameEl.style.display = '';

  // Timer en vivo si la partida ya empezó
  if (game.gameLength > 0) {
    let seconds = game.gameLength;
    setInterval(() => {
      seconds++;
      const el = document.getElementById('gameDuration');
      if (el) el.textContent = formatDuration(seconds);
    }, 1000);
  }

  // Scroll suave al resultado
  setTimeout(() => gameEl.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
}

function renderBan(ban, team) {
  if (ban.championId === -1) return ''; // sin ban
  const icon = ban.icon
    ? `<img src="${ban.icon}" alt="${ban.championName}" title="${ban.championName}">`
    : `<div style="width:38px;height:38px;border-radius:50%;background:var(--bg-card2);border:2px solid var(--border)"></div>`;
  return `
    <div class="ban-item" title="Ban: ${ban.championName}">
      ${icon}
      <div class="ban-overlay">❌</div>
      <span class="ban-team-label ban-team-${team}">${team.toUpperCase()}</span>
    </div>`;
}

function renderPlayer(player, isYou, index) {
  const delay = `animation-delay: ${index * 60}ms`;

  const champIcon = player.championIcon
    ? `<img src="${player.championIcon}" alt="${player.championName}" class="champ-icon">`
    : `<div class="champ-icon-placeholder">🎮</div>`;

  const rankHtml = player.rank
    ? `<div class="rank-tier tier-${player.rank.tier}">${player.rank.tier} ${player.rank.rank} · ${player.rank.lp} LP</div>
       <div class="rank-wr-small">WR ${player.rank.winrate}% (${player.rank.wins}V ${player.rank.losses}D)</div>`
    : `<div class="rank-unranked-small">SIN RANKEAR</div>`;

  const runeIcon = player.perks?.keystoneIcon
    ? `<img src="${player.perks.keystoneIcon}" class="rune-icon" title="${player.perks.keystoneName || 'Runa'}">`
    : '';

  return `
    <div class="player-row ${isYou ? 'is-you' : ''}" style="${delay}">
      <div class="champ-wrap">${champIcon}</div>
      <div class="player-meta">
        <div class="player-name">
          ${escapeHtml(player.summonerName)}
          ${isYou ? '<span class="you-badge">TÚ</span>' : ''}
        </div>
        <div class="champ-name">${escapeHtml(player.championName)}</div>
      </div>
      ${runeIcon}
      <div class="player-rank">${rankHtml}</div>
    </div>`;
}

// ── Helpers UI ──────────────────────────────────────────────────────────────
function showLoading(msg) {
  document.getElementById('loadingMsg').textContent = msg;
  document.getElementById('loadingState').style.display = '';
}
function hideLoading() {
  document.getElementById('loadingState').style.display = 'none';
}
function showError(msg) {
  document.getElementById('errorMsg').textContent = msg;
  document.getElementById('errorBox').style.display = '';
}
function hideError() {
  document.getElementById('errorBox').style.display = 'none';
}
function hideLiveGame() {
  document.getElementById('liveGame').style.display = 'none';
  document.getElementById('bansSection').style.display = 'none';
}
function setSearchBtnLoading(loading) {
  const btn = document.getElementById('searchBtn');
  btn.disabled = loading;
  btn.querySelector('.btn-text').textContent = loading ? 'BUSCANDO...' : 'BUSCAR';
}

// ── Helpers ─────────────────────────────────────────────────────────────────
async function apiFetch(url) {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || `Error ${res.status}`);
    err.code = data.code;
    throw err;
  }
  return data;
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
