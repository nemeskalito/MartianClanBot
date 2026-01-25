const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
require('dotenv').config();

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const ACCOUNT_ID = '0:39d63083e48f46452ff8a04cd0d3733a90c8be299aa5951b62741759b2c17e0e';
const TARGET_COLLECTION = 'Unstoppable Tribe from ZarGates';

let chatId = null;
let lastNftAddress = null;
let pendingQueue = {};
let nftInterval = null;
let pendingInterval = null;
let trackedSkin = null; // значение Skin Tone, которое нужно отслеживать

// -------------------- Универсальный GET с retry при 429 --------------------
async function safeGet(url, params = {}) {
  let tries = 0;
  while (tries < 5) {
    try {
      const { data } = await axios.get(url, { params });
      return data;
    } catch (e) {
      if (e.response?.status === 429) {
        const waitTime = (tries + 1) * 2000;
        console.warn(`429 Too Many Requests, ждем ${waitTime}ms...`);
        await new Promise(r => setTimeout(r, waitTime));
        tries++;
      } else {
        throw e;
      }
    }
  }
  throw new Error('Превышено количество попыток из-за 429');
}

// -------------------- Получаем последний NFT --------------------
async function getLastNftAddress() {
  try {
    const data = await safeGet(
      `https://tonapi.io/v2/accounts/${ACCOUNT_ID}/nfts/history`,
      { limit: 1 }
    );
    return data.operations?.[0]?.item?.address;
  } catch (e) {
    console.error('Ошибка getLastNftAddress:', e.message);
    return null;
  }
}

// -------------------- Получаем данные NFT --------------------
async function getNftData(nftId) {
  try {
    const data = await safeGet(`https://tonapi.io/v2/nfts/${nftId}`);
    return data;
  } catch (e) {
    console.error('Ошибка getNftData:', e.message);
    return null;
  }
}

// -------------------- Берём самое большое изображение --------------------
function getBestImage(nft) {
  if (!Array.isArray(nft.previews) || nft.previews.length === 0) return null;

  const sorted = nft.previews
    .filter(p => p.url && p.url.startsWith('https://'))
    .sort((a, b) => Number(b.resolution.split('x')[0]) - Number(a.resolution.split('x')[0]));

  return sorted[0]?.url || null;
}

// -------------------- Проверка атрибута Skin Tone --------------------
function checkSkinTone(nft) {
  if (!Array.isArray(nft.metadata?.attributes)) return false;

  const skinAttr = nft.metadata.attributes.find(a => a.trait_type === 'Skin Tone');
  if (!skinAttr) return false;

  return skinAttr.value.toLowerCase() === trackedSkin?.toLowerCase();
}

// -------------------- Отправка NFT в Telegram --------------------
async function sendNft(nft) {
  if (!chatId || !nft) return;

  const name = nft.metadata?.name || 'Без названия';
  const price = nft.sale ? Number(nft.sale.price.value) / 1e9 : null;
  const image = getBestImage(nft);
  if (!image) {
    console.log('Нет валидного изображения для NFT:', name);
    return;
  }

  let attributesText = '';
  if (Array.isArray(nft.metadata?.attributes)) {
    attributesText = nft.metadata.attributes
      .map(attr => `• <b>${attr.trait_type}:</b> ${attr.value}`)
      .reverse()
      .join('\n');
  }

  await bot.sendPhoto(chatId, image, {
    caption: `
🖼 <b>${name}</b>
💰 Цена: ${price ? price + ' TON' : 'в pending'}

${attributesText}
`.trim(),
    parse_mode: 'HTML',
  });
}

// -------------------- Основной цикл проверки новых NFT --------------------
async function checkNft() {
  try {
    const nftAddress = await getLastNftAddress();
    if (!nftAddress) return;
    if (nftAddress === lastNftAddress) return;
    lastNftAddress = nftAddress;

    const nftData = await getNftData(nftAddress);
    if (!nftData) return;

    if (nftData.collection?.name !== TARGET_COLLECTION) {
      console.log('NFT не из нужной коллекции, пропускаем:', nftData.metadata?.name);
      return;
    }

    if (!checkSkinTone(nftData)) {
      console.log('NFT не совпадает с нужным Skin Tone, пропускаем:', nftData.metadata?.name);
      return;
    }

    const price = nftData.sale ? Number(nftData.sale.price.value) / 1e9 : null;
    if (!price) {
      console.log('NFT pending, добавляем в очередь:', nftAddress);
      pendingQueue[nftAddress] = Date.now();
    } else {
      await sendNft(nftData);
    }

  } catch (e) {
    console.error('Ошибка checkNft:', e.message);
  }
}

// -------------------- Цикл обработки pending NFT --------------------
async function processPending() {
  try {
    const now = Date.now();
    for (const nftAddress of Object.keys(pendingQueue)) {
      if (now - pendingQueue[nftAddress] < 10000) continue;

      const nftData = await getNftData(nftAddress);
      if (!nftData) continue;

      if (nftData.collection?.name !== TARGET_COLLECTION) {
        console.log('NFT больше не в нужной коллекции, удаляем из очереди:', nftAddress);
        delete pendingQueue[nftAddress];
        continue;
      }

      if (!checkSkinTone(nftData)) {
        console.log('NFT больше не совпадает с Skin Tone, удаляем из очереди:', nftAddress);
        delete pendingQueue[nftAddress];
        continue;
      }

      const price = nftData.sale ? Number(nftData.sale.price.value) / 1e9 : null;
      if (price) {
        console.log('NFT получил цену, отправляем в чат:', nftAddress);
        await sendNft(nftData);
        delete pendingQueue[nftAddress];
      } else {
        pendingQueue[nftAddress] = now;
        console.log('NFT всё ещё pending:', nftAddress);
      }
    }
  } catch (e) {
    console.error('Ошибка processPending:', e.message);
  }
}

// -------------------- Команды для управления ботом --------------------
bot.onText(/\/track_skin (.+)/, (msg, match) => {
  chatId = msg.chat.id;
  trackedSkin = match[1]?.trim();

  if (!trackedSkin) {
    bot.sendMessage(chatId, '❌ Укажите значение Skin Tone после команды: /track_skin Urban');
    return;
  }

  if (!nftInterval) {
    nftInterval = setInterval(checkNft, 3000);
    pendingInterval = setInterval(processPending, 10000);
    bot.sendMessage(chatId, `🚀 Отслеживание NFT с Skin Tone: <b>${trackedSkin}</b> запущено!`, { parse_mode: 'HTML' });
  } else {
    bot.sendMessage(chatId, `⚠️ Отслеживание уже запущено. Текущее Skin Tone: <b>${trackedSkin}</b>`, { parse_mode: 'HTML' });
  }
});

bot.onText(/\/stop_nft/, (msg) => {
  chatId = msg.chat.id;

  if (nftInterval) {
    clearInterval(nftInterval);
    clearInterval(pendingInterval);
    nftInterval = null;
    pendingInterval = null;
    pendingQueue = {};
    lastNftAddress = null;
    trackedSkin = null;
    bot.sendMessage(chatId, '🛑 Отслеживание NFT остановлено!');
  } else {
    bot.sendMessage(chatId, '⚠️ Отслеживание не было запущено.');
  }
});
