const { 
  TONAPI_KEY, 
  COLLECTION_ADDRESS_TONAPI,
  sendPhotoResized 
} = require('./utils.js');
const axios = require('axios');

// Константы для этой команды
const MAX_SEND = 5;
const DEFAULT_LIMIT = 30;

async function fetchLatestNfts(limit = DEFAULT_LIMIT) {
  const url = `https://tonapi.io/v2/nfts/collections/${COLLECTION_ADDRESS_TONAPI}/items?limit=${limit}&offset=0`;

  try {
    const { data } = await axios.get(url, {
      headers: { 'X-API-Key': TONAPI_KEY },
    });

    return data.nft_items || [];
  } catch (err) {
    console.error('TON API error:', err.response?.status, err.message);
    return [];
  }
}

function filterMartians(items) {
  return items.filter(item =>
    item.metadata?.attributes?.some(attr =>
      attr.trait_type === 'Skin Tone' && attr.value === 'Martian'
    )
  );
}

async function handleNewMartian(bot, msg) {
  const chatId = msg.chat.id;

  await bot.sendMessage(chatId, '👽 Проверяю последние NFT...');

  const items = await fetchLatestNfts(DEFAULT_LIMIT);
  const martians = filterMartians(items);

  if (!martians.length) {
    return bot.sendMessage(chatId, '🫤 Среди последних NFT Martian не найдено');
  }

  await bot.sendMessage(
    chatId,
    `🔥 Свежие Martian NFT: ${martians.length}. Показываю первые ${Math.min(
      martians.length,
      MAX_SEND
    )}`
  );

  for (const item of martians.slice(0, MAX_SEND)) {
    const nft = item.metadata;
    const caption = `👽 ${nft.name || 'No Name'}`;

    await sendPhotoResized(bot, chatId, nft.image, caption);
  }
}

module.exports = { handleNewMartian };