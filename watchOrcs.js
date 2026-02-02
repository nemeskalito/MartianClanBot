require('dotenv').config();
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const sharp = require('sharp');
const fs = require('fs');

// ====== CONFIG ======
const API_TOKEN = "8528668156:AAFYMV7RoG86MO2mG0lJHWf310LjpjYTdxE";
const COLLECTION_ADDRESS =
  '0:463685d77d0474ec774386d92622ed688d34f07230741211d838c487dcfeec64';

const LIMIT = 1;       // проверяем по 1 NFT
const MAX_SEND = 1;    // сколько NFT отправляем за раз
const IMG_WIDTH = 350; // ширина картинки для Telegram
const CHECK_INTERVAL = 5000; // проверка раз в минуту
const STATE_FILE = './state.json';

let OFFSET = 29700; // стартовый offset

// ====== Чтение состояния ======
if (fs.existsSync(STATE_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (typeof saved.OFFSET === 'number') {
      OFFSET = saved.OFFSET;
    }
  } catch (e) {
    console.error('Ошибка чтения state.json', e.message);
  }
}

// ====== Сохранение состояния ======
function saveState() {
  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify({ OFFSET }, null, 2)
  );
}

// ====== BOT ======
const bot = new TelegramBot(API_TOKEN, { polling: true });
console.log('🤖 Bot started');

// ====== FETCH NFT ======
async function fetchNft(limit = LIMIT) {
  const url = `https://tonapi.io/v2/nfts/collections/${COLLECTION_ADDRESS}/items?limit=${limit}&offset=${OFFSET}`;
  try {
    const { data } = await axios.get(url);
    return data.nft_items || [];
  } catch (err) {
    console.error('TON API error:', err.response?.status, err.message);
    return [];
  }
}

// ====== FILTER Skin Tone ======
function filterSkinTone(items) {
  return items.filter(item =>
    item.metadata?.attributes?.some(
      attr => attr.trait_type === 'Skin Tone'
    )
  );
}

// ====== SEND IMAGE ======
async function sendPhotoResized(chatId, url, caption) {
  try {
    if (!url) throw new Error('Нет картинки');

    if (url.startsWith('ipfs://')) {
      url = url.replace('ipfs://', 'https://ipfs.io/ipfs/');
    }

    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data, 'binary');

    const resizedBuffer = await sharp(buffer)
      .resize({ width: IMG_WIDTH })
      .toBuffer();

    await bot.sendPhoto(chatId, resizedBuffer, { caption: caption.slice(0, 1024) });
  } catch (err) {
    console.error('Ошибка отправки NFT:', caption, err.message);
    await bot.sendMessage(chatId, caption + '\n(картинка недоступна)');
  }
}

// ====== WATCHER ======
async function checkNewOrcs(chatId) {
  const items = await fetchNft(LIMIT);
  const newOrcs = filterSkinTone(items);

  if (!newOrcs.length) {
    return; // новых NFT нет, offset не меняем
  }

  for (const item of newOrcs.slice(0, MAX_SEND)) {
    const nft = item.metadata;
    const caption = `🧟‍♂️ NEW NFT!\n${nft.name || 'No Name'}\n#${OFFSET}`;
    await sendPhotoResized(chatId, nft.image, caption);

    // увеличиваем offset на 1
    OFFSET += 1;
    saveState();
  }
}

// ====== COMMAND /watch_orcs ======
let watcherStarted = false;

bot.onText(/\/watch_orcs/, async (msg) => {
const chatId = msg.chat.id;
if (watcherStarted) {
  return bot.sendMessage(chatId, '⏳ Вотчер уже запущен');
}
watcherStarted = true;
await bot.sendMessage(chatId, `👀 Слежу за новыми NFT с Skin Tone... Стартовый offset: ${OFFSET}`);
// первый запуск сразу
await checkNewOrcs(chatId);
// автоматическая проверка раз в минуту
setInterval(() => {
  checkNewOrcs(chatId);
}, CHECK_INTERVAL);
});



