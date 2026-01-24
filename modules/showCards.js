const { 
  MAIN_DATA_FILE,
  ensureDataDir,
  truncateText
} = require('./utils.js');
const fs = require('fs').promises;

// Константы для отображения карточек
const CARDS_PER_MESSAGE = 3; // Сколько карточек показывать за раз
const MAX_ATTRIBUTES_PER_LINE = 2;

/**
 * Форматирует атрибуты для отображения в карточке
 */
function formatAttributes(attributes) {
  if (!attributes || !Array.isArray(attributes) || attributes.length === 0) {
    return ['Нет атрибутов', ''];
  }
  
  // Разбиваем атрибуты на строки по 2 в каждой
  const lines = [];
  for (let i = 0; i < attributes.length; i += MAX_ATTRIBUTES_PER_LINE) {
    const lineAttributes = attributes.slice(i, i + MAX_ATTRIBUTES_PER_LINE);
    const lineText = lineAttributes
      .map(attr => {
        const value = truncateText(attr.value, 15);
        return `• ${attr.trait_type}: ${value}`;
      })
      .join('    ');
    lines.push(lineText);
  }
  
  // Если строк меньше 2, добавляем пустые
  while (lines.length < 2) {
    lines.push('');
  }
  
  return lines.slice(0, 2);
}

/**
 * Создает карточку NFT в формате с рамкой
 */
function createNftCard(nft, index, total) {
  const attributesLines = formatAttributes(nft.attributes);
  
  // Экранируем специальные символы
  const escapeText = (text) => {
    if (!text) return '';
    return text.toString().replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
  };
  
  const nftName = escapeText(nft.name || `NFT #${nft.nft_index || index}`);
  
  // Формируем рамку вокруг карточки
  const topBorder = '┏' + '━'.repeat(38) + '┓';
  const bottomBorder = '┗' + '━'.repeat(38) + '┛';
  const sideBorder = '┃';
  
  const cardNumber = total > 1 ? `🎴 Карточка ${index + 1} из ${total}` : '🎴 Карточка NFT';
  
  // Формируем карточку
  let card = `${topBorder}\n`;
  card += `${sideBorder} ${cardNumber} ${sideBorder}\n`;
  card += `${sideBorder}                                          ${sideBorder}\n`;
  card += `${sideBorder} ${nftName} ${sideBorder}\n`;
  card += `${sideBorder}                                          ${sideBorder}\n`;
  
  if (nft.image_url) {
    card += `${sideBorder} 🖼️ Есть изображение ${sideBorder}\n`;
  } else {
    card += `${sideBorder} 🖼️ Нет изображения ${sideBorder}\n`;
  }
  
  card += `${sideBorder}                                          ${sideBorder}\n`;
  
  if (attributesLines[0]) {
    // Ограничиваем длину строки для рамки
    const line1 = attributesLines[0].length > 35 ? attributesLines[0].substring(0, 32) + '...' : attributesLines[0];
    card += `${sideBorder} ${line1} ${sideBorder}\n`;
  }
  
  if (attributesLines[1]) {
    const line2 = attributesLines[1].length > 35 ? attributesLines[1].substring(0, 32) + '...' : attributesLines[1];
    card += `${sideBorder} ${line2} ${sideBorder}\n`;
  }
  
  card += `${sideBorder}                                          ${sideBorder}\n`;
  
  if (nft.getgems_url) {
    card += `${sideBorder} 🌐 На GetGems ${sideBorder}\n`;
  }
  
  if (nft.owner_url) {
    card += `${sideBorder} 👤 Владелец ${sideBorder}\n`;
  }
  
  card += `${sideBorder}                                          ${sideBorder}\n`;
  card += `${sideBorder} 🆔 ${truncateText(nft.address, 30)} ${sideBorder}\n`;
  
  if (nft.on_sale !== undefined) {
    const saleStatus = nft.on_sale ? '💰 На продаже' : '📦 Не продается';
    card += `${sideBorder} ${saleStatus} ${sideBorder}\n`;
  }
  
  card += `${bottomBorder}`;
  
  return card;
}

/**
 * Получает NFT из файла данных
 */
async function getNftsFromFile(count = 5) {
  try {
    await ensureDataDir();
    
    try {
      await fs.access(MAIN_DATA_FILE);
    } catch (err) {
      return { success: false, error: 'Файл с данными не найден' };
    }
    
    const fileContent = await fs.readFile(MAIN_DATA_FILE, 'utf8');
    let allData;
    try {
      allData = JSON.parse(fileContent);
    } catch (parseError) {
      return { success: false, error: 'Ошибка чтения JSON файла' };
    }
    
    if (!Array.isArray(allData) || allData.length === 0) {
      return { success: false, error: 'Нет данных о NFT' };
    }
    
    console.log(`📊 В базе данных: ${allData.length} записей`);
    
    // Берем последние NFT (самые свежие)
    const recentNfts = allData.slice(-count * 2); // Берем больше чтобы учесть дубликаты
    
    // Убираем дубликаты по адресу
    const uniqueNfts = [];
    const seenAddresses = new Set();
    
    for (let i = recentNfts.length - 1; i >= 0; i--) {
      const nft = recentNfts[i];
      if (!seenAddresses.has(nft.address)) {
        seenAddresses.add(nft.address);
        uniqueNfts.unshift(nft); // Сохраняем порядок
      }
    }
    
    console.log(`🎯 Уникальных NFT найдено: ${uniqueNfts.length}`);
    
    // Берем нужное количество уникальных NFT
    const selectedNfts = uniqueNfts.slice(0, count);
    
    return {
      success: true,
      nfts: selectedNfts,
      totalInDb: allData.length,
      uniqueCount: uniqueNfts.length
    };
    
  } catch (error) {
    console.error('❌ Ошибка чтения файла данных:', error.message);
    return { success: false, error: 'Ошибка чтения данных: ' + error.message };
  }
}

/**
 * Основная функция обработки команды /show_cards
 */
async function handleShowCards(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || `user_${userId}`;
  
  // Парсим количество карточек из команды (/show_cards 5)
  const commandParts = msg.text.split(' ');
  let cardsCount = 3; // По умолчанию 3 карточки
  
  if (commandParts.length > 1 && !isNaN(parseInt(commandParts[1]))) {
    cardsCount = parseInt(commandParts[1]);
    cardsCount = Math.min(Math.max(cardsCount, 1), 10); // Ограничиваем от 1 до 10
  }

  try {
    console.log(`🃏 Пользователь ${username} запросил ${cardsCount} карточек NFT`);
    
    await bot.sendMessage(
      chatId,
      `🃏 Готовлю ${cardsCount} карточек NFT...\n\nИщу последние NFT в базе данных...`
    );
    
    // Получаем NFT из файла
    const nftsResult = await getNftsFromFile(cardsCount * 2);
    
    if (!nftsResult.success) {
      return bot.sendMessage(
        chatId,
        `❌ Ошибка:\n${nftsResult.error}\n\nИспользуйте /get_nfts_info для сбора данных.`
      );
    }
    
    const nfts = nftsResult.nfts.slice(0, cardsCount);
    
    console.log(`✅ Найдено NFT для отображения: ${nfts.length}`);
    
    if (nfts.length === 0) {
      return bot.sendMessage(
        chatId,
        `📭 Не найдено NFT для отображения\n\nБаза данных содержит ${nftsResult.totalInDb} записей,\nно после фильтрации дубликатов ничего не осталось.\n\nИспользуйте /get_nfts_info для сбора новых данных.`
      );
    }
    
    // Отправляем сообщение о начале отображения
    await bot.sendMessage(
      chatId,
      `✅ Найдено ${nfts.length} NFT\n\nСоздаю красивые карточки...\nБаза данных: ${nftsResult.totalInDb} записей\nУникальных NFT: ${nftsResult.uniqueCount}`
    );
    
    // Отправляем карточки группами
    for (let i = 0; i < nfts.length; i += CARDS_PER_MESSAGE) {
      const batch = nfts.slice(i, i + CARDS_PER_MESSAGE);
      const batchNumber = Math.floor(i / CARDS_PER_MESSAGE) + 1;
      const totalBatches = Math.ceil(nfts.length / CARDS_PER_MESSAGE);
      
      // Создаем сообщение с несколькими карточками
      let message = '';
      
      if (totalBatches > 1) {
        message += `📋 Пакет ${batchNumber} из ${totalBatches}\n\n`;
      }
      
      batch.forEach((nft, indexInBatch) => {
        const card = createNftCard(nft, i + indexInBatch, nfts.length);
        message += card + '\n\n';
      });
      
      // Отправляем сообщение с карточками (без Markdown разметки)
      await bot.sendMessage(chatId, message, {
        parse_mode: undefined, // Отключаем Markdown
        disable_web_page_preview: true
      });
      
      // Пауза между сообщениями чтобы не спамить
      if (batchNumber < totalBatches) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    // Отправляем итоговое сообщение
    const summaryMessage = `🎉 ${nfts.length} карточек NFT успешно показано!\n\nСтатистика базы данных:\n📊 Всего записей: ${nftsResult.totalInDb}\n🎯 Уникальных NFT: ${nftsResult.uniqueCount}\n\nДругие команды:\n/get_nfts_info - собрать новые данные\n/export_info - скачать базу данных\n/stats - подробная статистика`;
    
    await bot.sendMessage(chatId, summaryMessage);
    
    console.log(`✅ Показано ${nfts.length} карточек для ${username}`);
    
  } catch (error) {
    console.error('❌ Ошибка в команде /show_cards:', error.message);
    console.error(error.stack);
    
    await bot.sendMessage(
      chatId,
      `❌ Ошибка при создании карточек:\n${error.message}\n\nПопробуйте еще раз или используйте /get_nfts_info для обновления данных.`
    );
  }
}

module.exports = { handleShowCards };