const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const { Address } = require('ton');
require('dotenv').config();
const POWER_DB = require('./power.json');

const bot = new TelegramBot(process.env.API_TOKEN2, { polling: true });

const ACCOUNT_ID = '0:39d63083e48f46452ff8a04cd0d3733a90c8be299aa5951b62741759b2c17e0e';
const TARGET_COLLECTION = 'Unstoppable Tribe from ZarGates';

let chatId = null;

const pendingQueue = {};
const sentNfts = new Map(); // адрес + цена → timestamp
const ignoredNfts = new Set();

let nftInterval = null;
let pendingInterval = null;

const MAX_PENDING_TIME = 5 * 60 * 1000; // 5 минут
const SENT_TTL = 5 * 60 * 1000; // повторное показание NFT через 5 минут

// -------------------- chatId --------------------
bot.on('message', (msg) => {
  chatId = msg.chat.id;
});

// -------------------- safe GET --------------------
async function safeGet(url, params = {}) {
  let tries = 0;
  while (tries < 5) {
    try {
      const { data } = await axios.get(url, { params });
      return data;
    } catch (e) {
      if (e.response?.status === 429) {
        const wait = (tries + 1) * 2000;
        console.warn(`⏳ 429 rate limit, повтор через ${wait}мс`);
        await new Promise(r => setTimeout(r, wait));
        tries++;
      } else {
        console.error('❌ HTTP ошибка:', e.message);
        return null;
      }
    }
  }
  return null;
}

// -------------------- TON address → friendly --------------------
function toFriendlyAddress(rawAddress) {
  try {
    return Address.parse(rawAddress).toString({ urlSafe: true });
  } catch {
    return null;
  }
}

// -------------------- Getgems link --------------------
function getSaleLink(nft) {
  if (!nft?.address) return null;
  const friendly = toFriendlyAddress(nft.address);
  return friendly ? `https://getgems.io/nft/${friendly}` : null;
}

// -------------------- get last NFT addresses --------------------
async function getLastNftAddresses(limit = 10) {
  const data = await safeGet(
    `https://tonapi.io/v2/accounts/${ACCOUNT_ID}/nfts/history`,
    { limit }
  );

  if (!data) return [];

  return (data.operations ?? [])
    .map(op => op.item?.address)
    .filter(Boolean);
}

// -------------------- NFT data --------------------
async function getNftData(nftId) {
  return await safeGet(`https://tonapi.io/v2/nfts/${nftId}`);
}

// -------------------- best image --------------------
function getBestImage(nft) {
  if (!Array.isArray(nft.previews)) return null;

  return nft.previews
    .filter(p => p.url?.startsWith('https://'))
    .sort(
      (a, b) =>
        Number(b.resolution.split('x')[0]) -
        Number(a.resolution.split('x')[0])
    )[0]?.url || null;
}

// -------------------- send NFT --------------------
async function sendNft(nft) {
  if (!chatId || !nft) return;

  const name = nft.metadata?.name || 'Без названия';
  const price = nft.sale ? Number(nft.sale.price.value) / 1e9 : null;
  const image = getBestImage(nft);
  const saleLink = getSaleLink(nft);

  if (!image) {
    console.warn(`⚠️ NFT без изображения пропущена: ${nft.address}`);
    ignoredNfts.add(nft.address);
    return;
  }

  let attributesText = '';
  let totalPower = 0;

  if (Array.isArray(nft.metadata?.attributes)) {
    nft.metadata.attributes.forEach(a => {
      const attrPowerObj =
        POWER_DB.attributes[a.trait_type]?.find(attr => attr.name === a.value);
      const power = attrPowerObj ? attrPowerObj.power : 0;
      totalPower += power;
      attributesText += `• ${a.trait_type}: ${a.value} ⚡${power}\n`;
    });
  }

  const caption = `
🖼 <b>${name}</b>
💰 Цена: ${price ? price + ' TON' : 'в pending'}
<b>💪 Общая сила: ⚡${totalPower}</b>

${saleLink ? `🛒 <a href="${saleLink}">Купить на Getgems</a>\n` : ''}
${attributesText.trim()}
`.trim();

  await bot.sendPhoto(chatId, image, {
    caption,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
}

// -------------------- check new NFT --------------------
async function checkNft() {
  const nftAddresses = await getLastNftAddresses(10);

  const stats = { shown: 0, pending: 0, skipped: 0 };

  for (const address of nftAddresses) {
    const nft = await getNftData(address);
    if (!nft) continue;

    const name = nft.metadata?.name || 'Без названия';
    const collectionName = nft.collection?.name?.trim();

    if (collectionName !== TARGET_COLLECTION) {
      ignoredNfts.add(address);
      stats.skipped++;
      continue;
    }

    const price = nft.sale ? Number(nft.sale.price.value) / 1e9 : null;
    const nftKey = `${address}_${price ?? 'pending'}`;

    // Проверяем TTL
    if (sentNfts.has(nftKey) && Date.now() - sentNfts.get(nftKey) < SENT_TTL) {
      stats.skipped++;
      continue;
    }

    if (!price) {
      pendingQueue[address] = Date.now();
      stats.pending++;
      continue;
    }

    await sendNft(nft);
    sentNfts.set(nftKey, Date.now());
    stats.shown++;
  }

  if (stats.shown || stats.pending || stats.skipped) {
    console.log(
      `📦 NFT чек | ✅ показано: ${stats.shown} | ⏳ pending: ${stats.pending} | ❌ пропущено: ${stats.skipped}`
    );
  }
}

// -------------------- process pending --------------------
async function processPending() {
  const now = Date.now();
  let resolvedCount = 0;

  for (const address of Object.keys(pendingQueue)) {
    if (now - pendingQueue[address] > MAX_PENDING_TIME) {
      delete pendingQueue[address];
      ignoredNfts.add(address);
      continue;
    }

    const nft = await getNftData(address);
    if (!nft) continue;

    const price = nft.sale ? Number(nft.sale.price.value) / 1e9 : null;
    const nftKey = `${address}_${price ?? 'pending'}`;

    // Если появилась цена и не показывали недавно
    if (price && (!sentNfts.has(nftKey) || Date.now() - sentNfts.get(nftKey) > SENT_TTL)) {
      await sendNft(nft);
      sentNfts.set(nftKey, Date.now());
      delete pendingQueue[address];
      resolvedCount++;
    }
  }

  if (resolvedCount) {
    console.log(`💰 Pending обработано: ${resolvedCount}`);
  }
}

// -------------------- commands --------------------
bot.onText(/\/start_nft/, (msg) => {
  chatId = msg.chat.id;

  if (!nftInterval) {
    nftInterval = setInterval(checkNft, 1000);
    pendingInterval = setInterval(processPending, 2000);
    bot.sendMessage(chatId, '🚀 NFT отслеживание запущено');
  } else {
    bot.sendMessage(chatId, '⚠️ Уже запущено');
  }
});

bot.onText(/\/stop_nft/, (msg) => {
  chatId = msg.chat.id;

  if (nftInterval) {
    clearInterval(nftInterval);
    clearInterval(pendingInterval);
    nftInterval = null;
    pendingInterval = null;
    bot.sendMessage(chatId, '🛑 NFT отслеживание остановлено');
  } else {
    bot.sendMessage(chatId, '⚠️ Не запущено');
  }
});
