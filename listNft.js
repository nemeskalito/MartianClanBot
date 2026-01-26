const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const { Address } = require('ton');
require('dotenv').config();
const POWER_DB = require('./power.json');

const bot = new TelegramBot(process.env.API_TOKEN, { polling: true });

const ACCOUNT_ID = '0:39d63083e48f46452ff8a04cd0d3733a90c8be299aa5951b62741759b2c17e0e';
const TARGET_COLLECTION = 'Unstoppable Tribe from ZarGates';

let chatId = null;
let lastNftAddress = null;

const pendingQueue = {};
const sentNfts = new Set();

let nftInterval = null;
let pendingInterval = null;

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
        await new Promise(r => setTimeout(r, wait));
        tries++;
      } else {
        throw e;
      }
    }
  }
  throw new Error('Too many 429 retries');
}

// -------------------- TON address → friendly --------------------
function toFriendlyAddress(rawAddress) {
  try {
    const address = Address.parse(rawAddress);
    return address.toString({ urlSafe: true }); // EQ..., UQ...
  } catch (e) {
    console.error('Ошибка конвертации адреса:', rawAddress);
    return null;
  }
}

// -------------------- Getgems link --------------------
function getSaleLink(nft) {
  if (!nft?.address) return null;

  const friendly = toFriendlyAddress(nft.address);
  if (!friendly) return null;

  return `https://getgems.io/nft/${friendly}`;
}

// -------------------- last NFT --------------------
async function getLastNftAddress() {
  try {
    const data = await safeGet(
      `https://tonapi.io/v2/accounts/${ACCOUNT_ID}/nfts/history`,
      { limit: 1 }
    );
    return data.operations?.[0]?.item?.address || null;
  } catch {
    return null;
  }
}

// -------------------- NFT data --------------------
async function getNftData(nftId) {
  try {
    return await safeGet(`https://tonapi.io/v2/nfts/${nftId}`);
  } catch {
    return null;
  }
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

  const address = nft.address;
  if (sentNfts.has(address)) return;
  sentNfts.add(address);

  const name = nft.metadata?.name || 'Без названия';
  const price = nft.sale ? Number(nft.sale.price.value) / 1e9 : null;
  const image = getBestImage(nft);
  const saleLink = getSaleLink(nft);

  if (!image) return;

	let attributesText = '';
  let totalPower = 0;

	if (Array.isArray(nft.metadata?.attributes)) {
    nft.metadata.attributes.forEach(a => {
      const attrPowerObj = POWER_DB.attributes[a.trait_type]?.find(attr => attr.name === a.value);
      const power = attrPowerObj ? attrPowerObj.power : 0;
      totalPower += power;
      attributesText += `• <b>${a.trait_type}:</b> ${a.value} - ⚡${power}\n`;
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
  try {
    const nftAddress = await getLastNftAddress();
    if (!nftAddress) return;
    if (sentNfts.has(nftAddress)) return;
    if (nftAddress === lastNftAddress) return;

    lastNftAddress = nftAddress;

    const nft = await getNftData(nftAddress);
    if (!nft) return;

    if (nft.collection?.name !== TARGET_COLLECTION) return;

    const price = nft.sale ? Number(nft.sale.price.value) / 1e9 : null;

    if (!price) {
      pendingQueue[nftAddress] = Date.now();
      return;
    }

    await sendNft(nft);
  } catch {}
}

// -------------------- process pending --------------------
async function processPending() {
  const now = Date.now();

  for (const address of Object.keys(pendingQueue)) {
    if (sentNfts.has(address)) {
      delete pendingQueue[address];
      continue;
    }

    if (now - pendingQueue[address] < 10000) continue;

    const nft = await getNftData(address);
    if (!nft) continue;

    if (nft.collection?.name !== TARGET_COLLECTION) {
      delete pendingQueue[address];
      continue;
    }

    const price = nft.sale ? Number(nft.sale.price.value) / 1e9 : null;

    if (price) {
      await sendNft(nft);
      delete pendingQueue[address];
    } else {
      pendingQueue[address] = now;
    }
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
