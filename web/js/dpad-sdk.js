const STORAGE_PREFIX = 'bizarro-melee:v1:';
const SAVE_INTERVAL_MS = 1600;
const MAX_PACKET_BYTES = 512;
const SDK_EVENTS = [
  'FULLSCREEN_CHANGED', 'STATS_STORED', 'LOBBY_JOINED', 'LOBBY_USERS_UPDATED',
  'LOBBY_DATA_UPDATED', 'LOBBY_MESSAGE', 'LOBBY_KICKED', 'P2P_CONNECTION_ESTABLISHED',
  'P2P_CONNECTION_FAILED', 'P2P_PEER_RECONNECTING', 'P2P_PEER_RECONNECTED',
  'P2P_PEER_DISCONNECTED', 'P2P_PACKET_DROPPED',
];
const PEER_READY = new Set(['P2P_CONNECTION_ESTABLISHED', 'P2P_PEER_RECONNECTED']);
const PEER_LOST = new Set(['P2P_CONNECTION_FAILED', 'P2P_PEER_RECONNECTING', 'P2P_PEER_DISCONNECTED']);
const COUNTERS = { matches_won: 5, kos_scored: 100, wavedashes: 100, classic_clears: 2 };
const BOARDS = {
  'homerun-distance': 99999, 'classic-score': 9999999, 'ko-total': 999999,
  'targets-time': 600000, 'multiman-kos': 9999,
};
const VALID_SLOT = /^[A-Za-z0-9_-]{1,64}$/;
const emptyLobby = (statusText = 'Offline') => ({
  inLobby: false, lobbyId: null, isHost: false, inviteLink: null, peers: [], connected: false, statusText,
});

const int = (v, limit) => typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(limit, Math.round(v))) : 0;
const plainText = (value) => typeof value === 'string'
  ? value.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim().slice(0, 80) : null;
const safeCall = async (object, key, args = [], fallback = null) => {
  try {
    return typeof object?.[key] === 'function' ? await object[key](...args) : fallback;
  } catch {
    return fallback;
  }
};

function parsed(value) {
  try {
    const data = typeof value === 'string' ? JSON.parse(value) : value;
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

function playerProfile(player) {
  if (!player || typeof player.id !== 'string') return null;
  return {
    id: player.id, name: plainText(player.name), avatarUrl: typeof player.avatarUrl === 'string' ? player.avatarUrl : null,
    language: plainText(player.language),
  };
}

function cleanUser(user) {
  if (!user || typeof user.userId !== 'string') return null;
  return { userId: user.userId, username: plainText(user.username), isHost: !!user.isHost };
}

function lobbyKey(data) {
  return typeof data === 'string' ? data : typeof data?.lobbyId === 'string' ? data.lobbyId : null;
}

export function createDpadBridge() {
  const memory = new Map();
  const saves = new Map();
  const readyPeers = new Set();
  const users = new Map();
  let sdk = null;
  let player = null;
  let version = null;
  let statsReady = false;
  let listener = null;
  let initializing = null;
  let resultQueue = Promise.resolve();
  let busy = false;
  let online = emptyLobby();
  let hostId = null;
  let saveTimer = null;
  let saveInFlight = false;
  let lastSend = -Infinity;

  function readLocal(key) {
    if (memory.has(key)) return memory.get(key);
    try {
      return globalThis.window?.localStorage?.getItem(STORAGE_PREFIX + key) ?? null;
    } catch {
      return null;
    }
  }

  function writeLocal(key, value) {
    memory.set(key, value);
    try {
      const storage = globalThis.window?.localStorage;
      if (!storage) return false;
      storage.setItem(STORAGE_PREFIX + key, value);
      return true;
    } catch {
      return false;
    }
  }

  function removeLocal(key) {
    memory.delete(key);
    try {
      globalThis.window?.localStorage?.removeItem(STORAGE_PREFIX + key);
    } catch {
      // The in-memory copy is still cleared.
    }
  }

  function emit(event) {
    if (typeof listener !== 'function') return;
    try {
      Promise.resolve(listener(event)).catch(() => {});
    } catch {
      // The game UI callback must not interrupt the SDK state update.
    }
  }

  function refreshPeers() {
    online.peers = [...users.values()].filter((u) => u.userId !== player?.id).map((u) => ({
      ...u, isHost: hostId == null ? u.isHost : u.userId === hostId, connected: readyPeers.has(u.userId),
    }));
    online.connected = readyPeers.size > 0;
    if (online.connected) online.statusText = 'Opponent connected';
  }

  function clearLobby(statusText) {
    users.clear();
    readyPeers.clear();
    hostId = null;
    online = emptyLobby(statusText);
  }

  function applyLobby(id, isHost, statusText) {
    if (online.lobbyId !== id) {
      clearLobby(statusText);
      online.inLobby = true;
      online.lobbyId = id;
    }
    if (isHost != null) online.isHost = isHost;
  }

  function lobbyApi() {
    return sdk?.lobbies ?? sdk;
  }

  async function loadInvite(id) {
    if (online.lobbyId !== id) return null;
    const link = await safeCall(lobbyApi(), 'getLobbyInviteLink');
    if (online.lobbyId === id && typeof link === 'string') online.inviteLink = link;
    return online.lobbyId === id ? online.inviteLink : null;
  }

  function handleEvent(type, data) {
    if (type === 'LOBBY_JOINED' && lobbyKey(data)) {
      const id = lobbyKey(data);
      applyLobby(id, null, 'Waiting for opponent');
      hostId = data.hostId ?? null;
      users.clear();
      for (const raw of Array.isArray(data.users) ? data.users : []) {
        const u = cleanUser(raw);
        if (u) users.set(u.userId, u);
      }
      if (player && hostId != null) online.isHost = player.id === hostId;
      refreshPeers();
      // Public lobby creation and invite-link joins can emit this before their promises resolve.
    } else if (type === 'LOBBY_USERS_UPDATED' && online.inLobby && (!data?.lobbyId || data.lobbyId === online.lobbyId)) {
      const user = cleanUser(data);
      if (user && (data.changeType === 'LEFT' || data.changeType === 'KICKED')) {
        users.delete(user.userId);
        readyPeers.delete(user.userId);
        online.statusText = 'Waiting for opponent';
      } else if (user) {
        users.set(user.userId, user);
        online.statusText = 'Connecting to opponent';
      }
      if (data?.hostId != null) {
        hostId = data.hostId;
        if (player) online.isHost = hostId === player.id;
      }
      refreshPeers();
    } else if (type === 'LOBBY_KICKED' && (!data?.lobbyId || data.lobbyId === online.lobbyId)) {
      clearLobby('Lobby closed');
    } else if (online.inLobby && typeof data?.userId === 'string' && PEER_READY.has(type)) {
      readyPeers.add(data.userId);
      if (!users.has(data.userId)) users.set(data.userId, cleanUser(data));
      refreshPeers();
    } else if (online.inLobby && typeof data?.userId === 'string' && PEER_LOST.has(type)) {
      readyPeers.delete(data.userId);
      online.statusText = type === 'P2P_CONNECTION_FAILED' ? 'Could not connect to opponent' :
        type === 'P2P_PEER_RECONNECTING' ? 'Reconnecting to opponent' : 'Opponent disconnected';
      refreshPeers();
    }
    const category = type.startsWith('LOBBY_') || (type.startsWith('P2P_') && type !== 'P2P_PACKET_DROPPED') ? 'lobby' : 'sdk';
    emit({ type: category, name: type, data });
  }

  async function initialize() {
    try {
      sdk = globalThis.window?.dpad ?? globalThis.window?.Z2H ?? null;
      if (!sdk) return { available: false, version: null, player: null };
      const hasInit = typeof sdk.init === 'function';
      if (typeof sdk.on === 'function') {
        for (const type of SDK_EVENTS) {
          try { sdk.on(sdk.Events?.[type] ?? type, (data) => handleEvent(type, data)); } catch { /* legacy */ }
        }
      }
      const result = await safeCall(sdk, 'init', [{ p2p: { messageSize: MAX_PACKET_BYTES } }]);
      version = result?.version ?? (hasInit && result ? sdk.version : null) ?? 1;
      void safeCall(sdk, 'loadProgress', [1]);
      void safeCall(sdk, 'loadComplete');
      const [freshPlayer, statStatus] = await Promise.all([
        version >= 2 ? safeCall(sdk.player, 'get', [], result?.player ?? null) : result?.player ?? null,
        safeCall(sdk, 'requestStats'),
      ]);
      player = playerProfile(freshPlayer);
      if (online.inLobby) {
        if (hostId != null && player) online.isHost = player.id === hostId;
        refreshPeers();
        if (online.isHost) void loadInvite(online.lobbyId);
      } else online.statusText = version >= 2 ? 'Not in a lobby' : 'Online play unavailable';
      statsReady = statStatus === true || statStatus?.success === true;
      void flushSaves();
      return { available: true, version, player };
    } catch {
      return { available: false, version: null, player: null };
    }
  }

  function init(onEvent) {
    if (typeof onEvent === 'function') listener = onEvent;
    initializing ??= initialize();
    return initializing;
  }

  function getPlayer() {
    return player ? { ...player } : null;
  }

  async function loadSave(slot = 'default') {
    if (typeof slot !== 'string' || !VALID_SLOT.test(slot)) return null;
    const key = 'save:' + slot;
    const local = () => parsed(readLocal(key));
    const pending = saves.get(slot);
    if (pending?.dirty || readLocal('dirty:' + key) === '1') return local();
    const remote = parsed(await safeCall(sdk?.saves, 'load', [slot]));
    // A save queued during the network read is newer than its response.
    if (saves.get(slot)?.dirty || readLocal('dirty:' + key) === '1') return local();
    if (remote) {
      writeLocal(key, JSON.stringify(remote));
      return remote;
    }
    return local();
  }

  async function flushSaves() {
    if (saveInFlight || saveTimer || !sdk?.saves?.save) return;
    const next = [...saves].find(([, entry]) => entry.dirty && entry.queued);
    if (!next) return;
    const wait = SAVE_INTERVAL_MS - (Date.now() - lastSend);
    if (wait > 0) {
      saveTimer = setTimeout(() => {
        saveTimer = null;
        void flushSaves();
      }, wait);
      return;
    }
    const [slot, entry] = next;
    entry.queued = false;
    saveInFlight = true;
    lastSend = Date.now();
    const sent = entry.raw;
    const receipts = entry.receipts;
    entry.receipts = [];
    const result = await safeCall(sdk.saves, 'save', [sent, slot], false);
    saveInFlight = false;
    const durable = result === true || result?.success === true || result?.ok === true;
    for (const resolve of receipts) resolve({ saved: true, durable });
    if (entry.raw === sent && durable) {
      for (const resolve of entry.receipts) resolve({ saved: true, durable });
      entry.receipts = [];
      entry.dirty = false;
      entry.queued = false;
      removeLocal('dirty:save:' + slot);
    }
    if (entry.queued) {
      saves.delete(slot);
      saves.set(slot, entry);
    }
    void flushSaves();
  }

  async function saveData(obj, slot = 'default') {
    try {
      if (!obj || typeof obj !== 'object' || typeof slot !== 'string' || !VALID_SLOT.test(slot)) return { saved: false, durable: false };
      const raw = JSON.stringify(obj);
      if (typeof raw !== 'string') return { saved: false, durable: false };
      const local = writeLocal('save:' + slot, raw);
      writeLocal('dirty:save:' + slot, '1');
      let entry = saves.get(slot);
      if (!entry) {
        entry = { raw, dirty: true, queued: true, receipts: [] };
        saves.set(slot, entry);
      }
      if (entry.raw !== raw) {
        // A newer snapshot replaced this queued payload before it reached the host.
        for (const resolve of entry.receipts) resolve({ saved: true, durable: false });
        entry.receipts = [];
      }
      entry.raw = raw;
      entry.dirty = true;
      entry.queued = true;
      const receipt = !local && typeof sdk?.saves?.save === 'function'
        ? new Promise((resolve) => entry.receipts.push(resolve))
        : { saved: true, durable: local };
      void flushSaves();
      return receipt;
    } catch {
      return { saved: false, durable: false };
    }
  }

  function updateMatchStats(result) {
    const additions = {
      matches_won: result.won ? 1 : 0, kos_scored: int(result.kos, 999999),
      wavedashes: int(result.wavedashes, 999999), classic_clears: result.classicCleared ? 1 : 0,
    };
    const distance = int(result.homerunFeet, BOARDS['homerun-distance']);
    const arcade = int(result.classicScore, BOARDS['classic-score']);
    const targetsTime = int(result.targetsTimeMs, BOARDS['targets-time']);
    const multiman = int(result.multimanKos, BOARDS['multiman-kos']);
    const saved = parsed(readLocal('records')) ?? {};
    saved.stats ??= {};
    saved.boards ??= {};
    saved.achievements ??= {};
    for (const key of Object.keys(additions)) saved.stats[key] = int((saved.stats[key] || 0) + additions[key], 999999);
    saved.stats.homerun_best = Math.max(saved.stats.homerun_best || 0, distance);
    saved.boards['homerun-distance'] = saved.stats.homerun_best;
    saved.boards['classic-score'] = Math.max(saved.boards['classic-score'] || 0, arcade);
    saved.boards['ko-total'] = saved.stats.kos_scored;
    if (targetsTime > 0) saved.boards['targets-time'] = Math.min(saved.boards['targets-time'] || Infinity, targetsTime);
    if (multiman > 0) saved.boards['multiman-kos'] = Math.max(saved.boards['multiman-kos'] || 0, multiman);
    const unlocks = {
      sweetspot_king: !!result.sweetspotKo, mitt_slayer: !!result.classicCleared, homerun_hero: distance >= 1000,
    };
    for (const [key, unlocked] of Object.entries({
      ...unlocks, first_ko: saved.stats.kos_scored >= 1, wavedash_pro: saved.stats.wavedashes >= 10,
    })) if (unlocked) saved.achievements[key] = true;
    writeLocal('records', JSON.stringify(saved));
    return { additions, distance, arcade, unlocks, targetsTime, multiman };
  }

  async function publishResult({ additions, distance, arcade, unlocks, targetsTime, multiman }) {
    if (!sdk) return;
    let onlineKos = null;
    if (statsReady) {
      for (const [key, maxDelta] of Object.entries(COUNTERS)) {
        let remaining = int(additions[key], 999999);
        if (!remaining) continue;
        let current = int(await safeCall(sdk, 'getStat', [key]), 999999);
        while (remaining > 0) {
          const step = Math.min(maxDelta, remaining);
          const next = int(current + step, 999999);
          if (await safeCall(sdk, 'setStat', [key, next], false) === false) break;
          current = next;
          remaining -= step;
          if (key === 'kos_scored') onlineKos = current;
          if (remaining > 0) await safeCall(sdk, 'storeStats');
        }
      }
      if (distance > int(await safeCall(sdk, 'getStat', ['homerun_best']), 99999)) {
        await safeCall(sdk, 'setStat', ['homerun_best', distance]);
      }
      // dpad grants first_ko and wavedash_pro through their linked stats.
      for (const [id, unlocked] of Object.entries(unlocks)) if (unlocked) await safeCall(sdk, 'setAchievement', [id]);
      await safeCall(sdk, 'storeStats');
    }
    await Promise.all([
      distance > 0 && safeCall(sdk, 'uploadLeaderboardScore', ['homerun-distance', distance, true]),
      arcade > 0 && safeCall(sdk, 'uploadLeaderboardScore', ['classic-score', arcade, true]),
      onlineKos > 0 && safeCall(sdk, 'uploadLeaderboardScore', ['ko-total', onlineKos, true]),
      targetsTime > 0 && safeCall(sdk, 'uploadLeaderboardScore', ['targets-time', targetsTime, true]),
      multiman > 0 && safeCall(sdk, 'uploadLeaderboardScore', ['multiman-kos', multiman, true]),
    ]);
  }

  function recordMatchResult(result = {}) {
    try {
      const record = updateMatchStats(result);
      resultQueue = resultQueue.then(() => publishResult(record)).catch(() => {});
      return resultQueue;
    } catch {
      return Promise.resolve();
    }
  }

  async function getLeaderboard(id, limit = 10) {
    const size = int(limit, 100);
    if (!size || !Object.hasOwn(BOARDS, id)) return [];
    const rows = await safeCall(sdk, 'listLeaderboardEntries', [id, 0, size]);
    if (Array.isArray(rows)) {
      return rows.filter((entry) => entry && Number.isFinite(entry.score)).slice(0, size).map((entry, i) => {
        const name = plainText(entry.username ?? entry.name) || 'Player';
        const rank = entry.globalRank ?? entry.rank ?? i + 1;
        return { ...entry, username: name, globalRank: rank, name, rank };
      });
    }
    const score = parsed(readLocal('records'))?.boards?.[id] ?? 0;
    return score > 0 ? [{
      userId: player?.id ?? 'local', username: player?.name || 'You (local)', score, globalRank: 1, timestamp: 0,
      name: player?.name || 'You (local)', rank: 1,
    }] : [];
  }

  async function lobbyOperation(working, failure, action) {
    if (busy || online.inLobby) return null;
    const api = lobbyApi();
    if (!api) {
      online.statusText = 'Online play unavailable';
      return null;
    }
    busy = true;
    online.statusText = working;
    try {
      const response = await action(api);
      if (!response && !online.inLobby) online.statusText = failure;
      return response;
    } catch {
      if (!online.inLobby) online.statusText = failure;
      return null;
    } finally {
      busy = false;
    }
  }

  function createOnlineLobby(isPrivate = false) {
    return lobbyOperation('Creating lobby', 'Could not create lobby', async (api) => {
      const visibility = isPrivate ? api.LobbyVisibility?.PRIVATE ?? 2 : api.LobbyVisibility?.PUBLIC ?? 0;
      const created = await safeCall(api, 'createLobby', [visibility, 2]);
      const id = lobbyKey(created);
      if (!id) return null;
      applyLobby(id, true, 'Waiting for opponent');
      await loadInvite(id);
      return getOnlineState();
    });
  }

  function findPublicLobby() {
    return lobbyOperation('Searching for a lobby', 'No public lobby available', async (api) => {
      const response = await safeCall(api, 'listAvailableLobbies');
      const open = Array.isArray(response) ? response : response?.lobbies;
      if (!Array.isArray(open)) return null;
      for (const lobby of open) {
        const id = lobbyKey(lobby);
        if (!id || lobby.playerCount >= (lobby.maxPlayers ?? 2)) continue;
        const joined = await safeCall(api, 'joinLobby', [id]);
        if (!joined) continue;
        applyLobby(lobbyKey(joined) ?? id, null, 'Connecting to opponent');
        return getOnlineState();
      }
      const created = await safeCall(api, 'createLobby', [api.LobbyVisibility?.PUBLIC ?? 0, 2]);
      const id = lobbyKey(created);
      if (!id) return null;
      applyLobby(id, true, 'Waiting for opponent');
      await loadInvite(id);
      return getOnlineState();
    });
  }

  async function leaveOnlineLobby() {
    if (busy || !online.lobbyId) return false;
    busy = true;
    try {
      const left = await safeCall(lobbyApi(), 'leaveLobby', [online.lobbyId], false);
      if (left === false || left == null) {
        if (!online.inLobby) return true;
        online.statusText = 'Could not leave lobby';
        return false;
      }
      clearLobby('Not in a lobby');
      return true;
    } finally {
      busy = false;
    }
  }

  function getOnlineState() {
    return { ...online, peers: online.peers.map((p) => ({ ...p })) };
  }

  function sendP2P(channel, payload, reliable = false) {
    try {
      if (!online.connected || !Number.isInteger(channel) || channel < 0 || channel > 7) return false;
      const p2p = sdk?.p2p;
      const bytes = payload instanceof Uint8Array ? payload : payload instanceof ArrayBuffer
        ? new Uint8Array(payload) : new TextEncoder().encode(typeof payload === 'string' ? payload : JSON.stringify(payload));
      const max = p2p?.getP2PMaxPayloadSize?.() ?? MAX_PACKET_BYTES;
      return bytes.length > 0 && bytes.length <= Math.min(MAX_PACKET_BYTES, max) &&
        p2p?.broadcastP2PMessage?.(channel, !!reliable, bytes) === true;
    } catch {
      return false;
    }
  }

  function drainP2P(channel) {
    try {
      if (!online.inLobby || !Number.isInteger(channel) || channel < 0 || channel > 7) return [];
      const packets = sdk?.p2p?.drainP2PChannel?.(channel) ?? [];
      const decoder = new TextDecoder();
      return packets.filter((p) => p?.payload instanceof Uint8Array && p.payload.length <= MAX_PACKET_BYTES && readyPeers.has(p.fromUserId)).map((p) => {
        try {
          return { ...p, data: JSON.parse(decoder.decode(p.payload)) };
        } catch {
          return { ...p, data: decoder.decode(p.payload) };
        }
      });
    } catch {
      return [];
    }
  }

  function pollP2P(channels = [0, 1]) {
    for (const channel of channels) {
      for (const p of drainP2P(channel)) emit({ type: 'p2p', name: 'P2P_MESSAGE', ...p });
    }
  }

  return {
    init, getPlayer, loadSave, saveData, recordMatchResult, getLeaderboard,
    createOnlineLobby, findPublicLobby, leaveOnlineLobby, sendP2P, drainP2P, pollP2P, getOnlineState,
  };
}
