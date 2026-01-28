const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const { Address } = require('ton');
require('dotenv').config();
const POWER_DB = require('./power.json');

const bot = new TelegramBot(process.env.API_TOKEN2, { polling: true });

// ---------------- Настройки ----------------
const CHAT_ID = -1003706111240; // <- сюда вставь свой ID группы
const ACCOUNT_ID = '0:39d63083e48f46452ff8a04cd0d3733a90c8be299aa5951b62741759b2c17e0e';
const TARGET_COLLECTION = 'Unstoppable Tribe from ZarGates';

// ---------------- state ----------------
const pendingQueue = {};
const sentNfts = new Map();
const ignoredNfts = new Set();
const sendQueue = [];

let sending = false;
let nftInterval = null;
let pendingInterval = null;
let sendInterval = null;

const MAX_PENDING_TIME = 5 * 60 * 1000;
const SENT_TTL = 10 * 60 * 1000;

let lastSendTime = Date.now();
let last429Log = 0;

// ---------------- safe GET ----------------
async function safeGet(url, params = {}) {
  let tries = 0;
  let wait = 2000;

  while (tries < 5) {
    try {
      const { data } = await axios.get(url, { params });
      return data;
    } catch (e) {
      if (e.response?.status === 429) {
        const now = Date.now();
        if (now - last429Log > 5000) {
          console.warn(`⏳ 429 rate limit, повтор через ${wait}мс`);
          last429Log = now;
        }
        await new Promise(r => setTimeout(r, wait));
        wait *= 2;
        tries++;
      } else {
        console.error('❌ HTTP ошибка:', e.message);
        return null;
      }
    }
  }
  return null;
}

// ---------------- helpers ----------------
const toFriendlyAddress = raw =>
  Address.parse(raw).toString({ urlSafe: true });

const getSaleLink = nft =>
  nft?.address ? `https://getgems.io/nft/${toFriendlyAddress(nft.address)}` : null;

const getBestImage = nft =>
  nft?.previews
    ?.filter(p => p.url?.startsWith('https://'))
    .sort((a, b) => Number(b.resolution.split('x')[0]) - Number(a.resolution.split('x')[0]))[0]?.url || null;

// ---------------- NFT API ----------------
const getLastNftAddresses = async (limit = 5) => {
  const data = await safeGet(`https://tonapi.io/v2/accounts/${ACCOUNT_ID}/nfts/history`, { limit });
  return data?.operations?.map(op => op.item?.address).filter(Boolean) || [];
};

const getNftData = async (id) =>
  await safeGet(`https://tonapi.io/v2/nfts/${id}`);

// ---------------- бонус за числа ----------------
function getNumberPowerBonus(nft) {
  let bonus = 0;
  const textToScan = [
    nft.metadata?.name || '',
    ...(Array.isArray(nft.metadata?.attributes) ? nft.metadata.attributes.map(a => a.value) : [])
  ].join(' ');

  for (const np of POWER_DB.number_power) {
    const regex = new RegExp(`\\b${np.sticker_number}\\b`, 'g');
    if (regex.test(textToScan)) bonus += np.power;
  }

  return bonus;
}

// ---------------- send NFT ----------------
async function sendNft(nft) {
  const image = getBestImage(nft);
  if (!image) return;

  let name = nft.metadata?.name || 'Без названия';
  const price = nft.sale ? Number(nft.sale.price.value) / 1e9 : null;
  const saleLink = getSaleLink(nft);

  let totalPower = 0;
  let attributesText = '';
  const attrNamesForSynergy = [];
  const attrMap = {};

  if (Array.isArray(nft.metadata?.attributes)) {
    nft.metadata.attributes.forEach(a => {
      let type = a.trait_type;
      if (type.toLowerCase().includes('earring') && POWER_DB.attributes['Earrings']) type = 'Earrings';
      if (type.toLowerCase().includes('cap') && POWER_DB.attributes['Cap']) type = 'Cap';

      const attrPowerObj = POWER_DB.attributes[type]?.find(x => x.name === a.value);
      const power = attrPowerObj ? attrPowerObj.power : 0;
      totalPower += power;
      attrMap[a.value] = type;

      if (type !== 'Skin Tone') attrNamesForSynergy.push(a.value);
    });
  }

  // --------- синергия ---------
  const synergyAttrSet = new Set();
  for (let i = 0; i < attrNamesForSynergy.length; i++) {
    const words1 = attrNamesForSynergy[i].split(/\s+/);
    for (let j = i + 1; j < attrNamesForSynergy.length; j++) {
      const words2 = attrNamesForSynergy[j].split(/\s+/);
      if (words1.some(w1 => words2.some(w2 =>
        POWER_DB.synergy.some(s => w1.toLowerCase().startsWith(s.toLowerCase()) && w2.toLowerCase().startsWith(s.toLowerCase()))
      ))) {
        synergyAttrSet.add(attrNamesForSynergy[i]);
        synergyAttrSet.add(attrNamesForSynergy[j]);
      }
    }
  }

  let synergyBonus = 0;
  const synergyCount = synergyAttrSet.size;
  if (synergyCount === 2) synergyBonus = 100;
  else if (synergyCount >= 3) synergyBonus = 300;

  if (Array.isArray(nft.metadata?.attributes)) {
    nft.metadata.attributes.forEach(a => {
      const power = POWER_DB.attributes[attrMap[a.value]]?.find(attr => attr.name === a.value)?.power || 0;
      const isSynergy = synergyAttrSet.has(a.value);
      attributesText += `• ${a.trait_type}: ${a.value} ⚡${power} ${isSynergy ? '(Synergy)' : ''}\n`;
    });
  }

  if (synergyCount === 0) name += ' (без Synergy)';

  // --------- бонус за Number ---------
  const numberBonus = getNumberPowerBonus(nft);
  const totalPowerFinal = totalPower + synergyBonus + numberBonus;

  let numberTextTop = '';
  if (numberBonus === 500) numberTextTop = '💥 Крутой номер!';
  else if (numberBonus === 1000) numberTextTop = '🔥 Невероятный номер!';
  else if (numberBonus === 5000) numberTextTop = '🍀 Самый счастливый номер!';

  let powerText = `⚡${totalPower + synergyBonus}`;
  const bonusParts = [];
  if (synergyBonus) bonusParts.push(`Synergy +${synergyBonus}`);
  if (numberBonus) bonusParts.push(`Bonus за Number +${numberBonus}`);
  if (bonusParts.length) powerText += ` (${bonusParts.join(', ')})`;

  const caption = `
${numberTextTop ? numberTextTop + '\n' : ''}
🖼 <b>${name}</b>
💰 Цена: ${price ? price + ' TON' : 'pending'}
<b>💪 Общая сила: ${powerText}</b>

${saleLink ? `🛒 <a href="${saleLink}">Купить на Getgems</a>\n` : ''}
${attributesText.trim()}
`.trim();

  await bot.sendPhoto(CHAT_ID, image, {
    caption,
    parse_mode: 'HTML',
    disable_web_page_preview: true
  });

  lastSendTime = Date.now();
  console.log(`✅ NFT отправлена | ${name} | Power: ${totalPowerFinal}`);
}

// ---------------- queue ----------------
async function processSendQueue() {
  if (sending || !sendQueue.length) return;
  sending = true;

  try {
    while (sendQueue.length) {
      const nft = sendQueue.shift();
      await sendNft(nft);
      await new Promise(r => setTimeout(r, 1500));
    }
  } catch (e) {
    console.error('❌ Ошибка sendQueue:', e.message);
  }

  sending = false;
}

// ---------------- check NFT ----------------
async function checkNft() {
  try {
    const list = await getLastNftAddresses();

    for (const addr of list) {
      const key = addr.toLowerCase();
      if (ignoredNfts.has(key)) continue;

      const nft = await getNftData(addr);
      if (!nft) continue;

      if (nft.collection?.name !== TARGET_COLLECTION) {
        ignoredNfts.add(key);
        console.log(`❌ NFT ПРОПУЩЕНА | ${nft.metadata?.name || 'Без названия'} | другая коллекция`);
        continue;
      }

      const price = nft.sale ? Number(nft.sale.price.value) / 1e9 : null;
      const nftKey = `${key}_${price ?? 'pending'}`;

      if (sentNfts.has(nftKey) && Date.now() - sentNfts.get(nftKey) < SENT_TTL) continue;

      if (!price) {
        pendingQueue[key] = Date.now();
        continue;
      }

      sendQueue.push(nft);
      sentNfts.set(nftKey, Date.now());
      delete pendingQueue[key];
    }
  } catch (e) {
    console.error('❌ checkNft ошибка:', e.message);
  }
}

// ---------------- pending ----------------
async function processPending() {
  const now = Date.now();

  for (const key of Object.keys(pendingQueue)) {
    if (now - pendingQueue[key] > MAX_PENDING_TIME) {
      delete pendingQueue[key];
      ignoredNfts.add(key);
      continue;
    }

    const nft = await getNftData(key);
    if (!nft) continue;

    const price = nft.sale ? Number(nft.sale.price.value) / 1e9 : null;
    if (price) sendQueue.push(nft);
  }
}

// ---------------- watchdog ----------------
setInterval(() => {
  if (Date.now() - lastSendTime > 10 * 60 * 1000 && nftInterval) {
    console.warn('♻️ Watchdog: перезапуск NFT');
    stopNft();
    startNft();
  }
}, 60_000);

// ---------------- commands ----------------
function startNft() {
  if (nftInterval) return;

  nftInterval = setInterval(checkNft, 2000);
  pendingInterval = setInterval(processPending, 3000);
  sendInterval = setInterval(processSendQueue, 1000);

  bot.sendMessage(CHAT_ID, '🚀 NFT отслеживание запущено');
}

function stopNft() {
  clearInterval(nftInterval);
  clearInterval(pendingInterval);
  clearInterval(sendInterval);
  nftInterval = pendingInterval = sendInterval = null;
  bot.sendMessage(CHAT_ID, '🛑 NFT отслеживание остановлено');
}

bot.onText(/\/start_nft/, startNft);
bot.onText(/\/stop_nft/, stopNft);

// ---------------- delete user messages (не команды) ----------------
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  if (msg.from.is_bot) return;

  try {
    await bot.deleteMessage(msg.chat.id, msg.message_id);
    console.log(`🗑 Удалено сообщение от ${msg.from.first_name}`);
  } catch {}
});
