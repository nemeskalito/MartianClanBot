const fs = require('fs').promises;
const path = require('path');
const { MAIN_DATA_FILE, ensureDataDir } = require('./utils.js');

const BOT_CARDS_FILE = path.join(__dirname, '../nft_data/bot_nft_cards.json');

// Функция для безопасного экранирования HTML
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Функция для проверки валидности URL
function sanitizeUrl(url) {
  if (!url) return '';
  // Убираем небезопасные символы из URL для HTML
  return String(url)
    .replace(/"/g, '%22')
    .replace(/'/g, '%27')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E');
}

// Функция для создания простой карточки для бота
function createBotNftCard(nft) {
  try {
    const name = nft.name || `NFT #${nft.nft_index}`;
    const imageUrl = sanitizeUrl(nft.image_url || '');
    const getgemsUrl = sanitizeUrl(nft.getgems_url || '');
    const ownerUrl = sanitizeUrl(nft.owner_url || '');
    
    // Безопасное экранирование имени
    const escapedName = escapeHtml(name);
    
    // Формируем атрибуты (все 4, как в структуре)
    let attributesText = '';
    if (nft.attributes && Array.isArray(nft.attributes)) {
      // Берем все 4 атрибута
      const attributes = nft.attributes.slice(0, 4);
      const attributeLines = [];
      
      for (const attr of attributes) {
        const traitType = attr.trait_type || 'Атрибут';
        const value = attr.value || 'N/A';
        
        // Экранируем и убираем HTML теги из значений
        const safeTraitType = escapeHtml(traitType).replace(/<[^>]*>/g, '');
        const safeValue = escapeHtml(value).replace(/<[^>]*>/g, '');
        
        attributeLines.push(`"${safeTraitType}" "${safeValue}"`);
      }
      
      attributesText = attributeLines.join('\n');
    } else {
      attributesText = 'Атрибуты отсутствуют';
    }
    
    // Создаем карточку - ВАЖНО: все теги <a> должны быть правильно закрыты
    // Используем более простой формат без переносов строк внутри тегов
    const cardText = 
      `<b>${escapedName}</b>\n\n` +
      (imageUrl ? `🖼️ <a href="${imageUrl}">Изображение NFT</a>\n\n` : '') +
      `<b>атрибуты:</b>\n` +
      `${attributesText}\n\n` +
      (getgemsUrl ? `<a href="${getgemsUrl}">GetGems</a>\n` : '') +
      (ownerUrl ? `<a href="${ownerUrl}">Владелец</a>` : '');
    
    return {
      id: `nft-${nft.nft_index}`,
      card_text: cardText.trim()
    };
  } catch (error) {
    console.error(`❌ Ошибка создания карточки для NFT ${nft.nft_index}:`, error.message);
    // Возвращаем минимальную карточку в случае ошибки
    return {
      id: `nft-${nft.nft_index}`,
      card_text: `<b>NFT #${nft.nft_index}</b>\n\nОшибка при создании карточки`
    };
  }
}

// Функция для проверки HTML карточки
function validateCardHtml(cardText) {
  try {
    // Проверяем закрытие тегов
    const openBTags = (cardText.match(/<b>/g) || []).length;
    const closeBTags = (cardText.match(/<\/b>/g) || []).length;
    
    const openATags = (cardText.match(/<a\s[^>]*>/g) || []).length;
    const closeATags = (cardText.match(/<\/a>/g) || []).length;
    
    // Проверяем отсутствие незакрытых тегов
    if (openBTags !== closeBTags) {
      console.warn(`⚠️ Несбалансированные теги <b>: ${openBTags} открыто, ${closeBTags} закрыто`);
      return false;
    }
    
    if (openATags !== closeATags) {
      console.warn(`⚠️ Несбалансированные теги <a>: ${openATags} открыто, ${closeATags} закрыто`);
      return false;
    }
    
    // Проверяем корректность URL в href
    const hrefMatches = cardText.match(/href="([^"]*)"/g) || [];
    for (const href of hrefMatches) {
      const url = href.match(/href="([^"]*)"/)[1];
      if (url.includes('<') || url.includes('>') || url.includes('"')) {
        console.warn(`⚠️ Небезопасный символ в URL: ${url.substring(0, 50)}...`);
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error('❌ Ошибка валидации HTML:', error.message);
    return false;
  }
}

// Функция для создания карточек из данных NFT
async function createNftCards() {
  try {
    console.log('🔄 Начинаю создание NFT карточек для бота...');
    
    // Убеждаемся что папка существует
    await ensureDataDir();
    
    // Читаем данные из основного файла
    let nftData = [];
    try {
      const fileContent = await fs.readFile(MAIN_DATA_FILE, 'utf8');
      nftData = JSON.parse(fileContent);
      if (!Array.isArray(nftData)) {
        throw new Error('Invalid data format');
      }
    } catch (err) {
      console.error('❌ Ошибка чтения файла с данными:', err.message);
      return { 
        success: false, 
        error: `Ошибка чтения данных: ${err.message}` 
      };
    }
    
    if (nftData.length === 0) {
      return { 
        success: false, 
        error: 'Нет данных для создания карточек. Сначала выполните /get_nfts_info' 
      };
    }
    
    console.log(`📊 Найдено NFT в базе данных: ${nftData.length}`);
    
    // Создаем карточки для бота (только id и card_text)
    const botCards = [];
    const stats = {
      total: nftData.length,
      validCards: 0,
      invalidCards: 0,
      withImages: 0,
      withAttributes: 0
    };
    
    for (const nft of nftData) {
      const botCard = createBotNftCard(nft);
      
      // Валидируем HTML карточки
      const isValid = validateCardHtml(botCard.card_text);
      
      if (isValid) {
        botCards.push(botCard);
        stats.validCards++;
      } else {
        console.warn(`⚠️ Карточка ${botCard.id} не прошла валидацию HTML`);
        stats.invalidCards++;
        
        // Добавляем карточку с безопасным текстом
        const safeCard = {
          id: botCard.id,
          card_text: `<b>NFT #${nft.nft_index}</b>\n\nКарточка содержит небезопасные символы`
        };
        botCards.push(safeCard);
      }
      
      // Собираем статистику
      if (nft.image_url) stats.withImages++;
      if (nft.attributes && nft.attributes.length > 0) stats.withAttributes++;
    }
    
    // Тестовая отправка случайной карточки для отладки
    if (botCards.length > 0) {
      const testCard = botCards[Math.floor(Math.random() * botCards.length)];
      console.log(`🔍 Тестовая карточка (первые 200 символов):`);
      console.log(testCard.card_text.substring(0, 200) + '...');
      
      // Проверяем конкретные символы, которые могут вызывать проблемы
      const problemChars = ['&', '<', '>', '"', "'"];
      for (const char of problemChars) {
        const count = (testCard.card_text.match(new RegExp(char, 'g')) || []).length;
        if (count > 0) {
          console.log(`   Символ "${char}" встречается ${count} раз`);
        }
      }
    }
    
    // Сохраняем карточки для бота в JSON файл
    await fs.writeFile(BOT_CARDS_FILE, JSON.stringify(botCards, null, 2), 'utf8');
    
    console.log('✅ Карточки для бота успешно созданы!');
    console.log(`📊 Статистика:`);
    console.log(`   Всего NFT: ${stats.total}`);
    console.log(`   Валидных карточек: ${stats.validCards}`);
    console.log(`   Невалидных карточек: ${stats.invalidCards}`);
    console.log(`   С изображениями: ${stats.withImages}`);
    console.log(`   С атрибутами: ${stats.withAttributes}`);
    console.log(`📁 Файл сохранен: ${BOT_CARDS_FILE}`);
    
    return {
      success: true,
      cardsCount: botCards.length,
      stats: stats,
      file: BOT_CARDS_FILE
    };
    
  } catch (error) {
    console.error('❌ Ошибка создания карточек:', error.message);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

// Обработчик команды для бота
async function handleCreateCards(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || `user_${userId}`;

  try {
    // Отправляем сообщение о начале создания карточек
    const statusMsg = await bot.sendMessage(
      chatId,
      `🎨 *Создаю NFT карточки для бота...*\n\n` +
      `📊 Загружаю данные из базы\n` +
      `🔒 Проверяю безопасность HTML\n` +
      `🎯 Формирую карточки\n` +
      `💾 Сохраняю в файл\n\n` +
      `⏳ Пожалуйста, подождите...`,
      { parse_mode: 'Markdown' }
    );

    // Создаем карточки
    const result = await createNftCards();
    
    if (!result.success) {
      await bot.editMessageText(
        `❌ *Ошибка создания карточек:*\n${result.error}`,
        {
          chat_id: chatId,
          message_id: statusMsg.message_id,
          parse_mode: 'Markdown'
        }
      );
      return;
    }

    // Формируем сообщение об успехе
    const stats = result.stats;
    const successMessage = `✅ *NFT карточки успешно созданы!*\n\n` +
      `📊 *Статистика:*\n` +
      `🎴 Всего NFT: ${stats.total}\n` +
      `✅ Валидных карточек: ${stats.validCards}\n` +
      `⚠️  Невалидных: ${stats.invalidCards}\n` +
      `🖼️  С изображениями: ${stats.withImages}\n` +
      `🏷️  С атрибутами: ${stats.withAttributes}\n\n` +
      `📁 *Файл:* \`nft_data/bot_nft_cards.json\`\n\n` +
      `🛠️ *Теперь используйте:*\n` +
      `/show_cards - показать карточки\n` +
      `/show_cards N - показать N карточек`;

    await bot.editMessageText(successMessage, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
      parse_mode: 'Markdown'
    });

    console.log(`✅ Карточки созданы для ${username}, обработано: ${stats.total} NFT`);

  } catch (error) {
    console.error('❌ Ошибка в команде /createCards:', error.message);
    
    await bot.sendMessage(
      chatId,
      `❌ *Критическая ошибка:*\n${error.message}\n\n` +
      `*Возможные причины:*\n` +
      `• Небезопасные символы в данных NFT\n` +
      `• Некорректный формат URL\n` +
      `• Проблемы с HTML разметкой\n\n` +
      `Попробуйте сначала очистить данные: /get_nfts_info`
    );
  }
}

// Функция для получения всех карточек
async function getAllBotCards() {
  try {
    const cardsContent = await fs.readFile(BOT_CARDS_FILE, 'utf8');
    const cardsData = JSON.parse(cardsContent);
    
    return Array.isArray(cardsData) ? cardsData : [];
    
  } catch (error) {
    console.error('❌ Ошибка получения карточек:', error.message);
    return [];
  }
}

module.exports = { 
  handleCreateCards,
  createNftCards,
  getAllBotCards
};