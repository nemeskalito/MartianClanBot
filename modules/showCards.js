const { 
  ensureDataDir
} = require('./utils.js');
const fs = require('fs').promises;
const path = require('path');

// Константы для отображения карточек
const CARDS_PER_MESSAGE = 1;
const BOT_CARDS_FILE = path.join(__dirname, '../nft_data/bot_nft_cards.json');

/**
 * Получает карточки NFT из файла bot_nft_cards.json
 */
async function getCardsFromFile(count = 5) {
  try {
    await ensureDataDir();
    
    try {
      await fs.access(BOT_CARDS_FILE);
      console.log(`📂 Файл найден: ${BOT_CARDS_FILE}`);
    } catch (err) {
      console.log(`❌ Файл не найден: ${BOT_CARDS_FILE}`);
      return { 
        success: false, 
        error: 'Файл с карточками не найден. Сначала выполните /createCards' 
      };
    }
    
    const fileContent = await fs.readFile(BOT_CARDS_FILE, 'utf8');
    let cards;
    try {
      cards = JSON.parse(fileContent);
      console.log(`📊 JSON успешно распарсен, карточек: ${Array.isArray(cards) ? cards.length : 'не массив'}`);
    } catch (parseError) {
      console.error('❌ Ошибка парсинга JSON:', parseError.message);
      return { 
        success: false, 
        error: 'Ошибка чтения файла карточек: ' + parseError.message 
      };
    }
    
    // Проверяем что это массив
    if (!Array.isArray(cards)) {
      console.error('❌ Неправильный формат файла, ожидается массив');
      return { 
        success: false, 
        error: 'Неправильный формат файла карточек. Ожидается массив' 
      };
    }
    
    if (cards.length === 0) {
      return { success: false, error: 'Нет созданных карточек NFT' };
    }
    
    console.log(`✅ Всего карточек в файле: ${cards.length}`);
    
    // Проверяем структуру карточек - ТЕПЕРЬ ТОЛЬКО id и card_text
    const validCards = cards.filter(card => {
      return card && card.id && card.card_text;
    });
    
    if (validCards.length === 0) {
      console.log('❌ Нет валидных карточек с полями id и card_text');
      console.log('Первая карточка для отладки:', cards[0]);
      return { 
        success: false, 
        error: 'Карточки не содержат текста для отправки' 
      };
    }
    
    console.log(`✅ Корректных карточек: ${validCards.length}`);
    
    // Берем указанное количество карточек
    const selectedCards = validCards.slice(0, count);
    
    return {
      success: true,
      cards: selectedCards,
      totalCards: validCards.length
    };
    
  } catch (error) {
    console.error('❌ Ошибка чтения файла карточек:', error.message);
    return { 
      success: false, 
      error: 'Ошибка чтения карточек: ' + error.message 
    };
  }
}

/**
 * Отправляет карточку в Telegram
 */
async function sendCardToBot(bot, chatId, card) {
  try {
    console.log(`📤 Отправляю карточку: ${card.id}`);
    
    // Отправляем карточку (одним сообщением с HTML разметкой)
    await bot.sendMessage(chatId, card.card_text, {
      parse_mode: 'HTML',
      disable_web_page_preview: false // Разрешаем превью ссылок
    });
    
    return true;
  } catch (error) {
    console.error('❌ Ошибка отправки карточки:', error.message);
    
    // Пробуем отправить без HTML (если есть ошибка парсинга)
    if (error.message.includes('parse entities') || error.message.includes('HTML')) {
      console.log('🔄 Пробую отправить как обычный текст...');
      try {
        // Убираем HTML теги для простого текста
        const plainText = card.card_text
          .replace(/<b>(.*?)<\/b>/g, '*$1*')
          .replace(/<a href=".*?">(.*?)<\/a>/g, '$1')
          .replace(/<[^>]*>/g, '');
        
        await bot.sendMessage(chatId, plainText, {
          parse_mode: 'Markdown'
        });
        return true;
      } catch (fallbackError) {
        console.error('❌ Ошибка при отправке простого текста:', fallbackError.message);
      }
    }
    
    return false;
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
    
    // Проверяем наличие файла карточек
    const statusMessage = await bot.sendMessage(
      chatId,
      `🃏 Ищу готовые карточки NFT...\nЗапрошено: ${cardsCount} карточек`
    );
    
    // Получаем карточки из файла
    const cardsResult = await getCardsFromFile(cardsCount);
    
    if (!cardsResult.success) {
      await bot.editMessageText(
        `❌ ${cardsResult.error}\n\nСначала создайте карточки командой /createCards`,
        {
          chat_id: chatId,
          message_id: statusMessage.message_id,
          parse_mode: 'HTML'
        }
      );
      return;
    }
    
    const cards = cardsResult.cards;
    
    console.log(`✅ Найдено карточек для отображения: ${cards.length}`);
    
    // Обновляем статус
    await bot.editMessageText(
      `✅ Найдено ${cards.length} карточек\nНачинаю отправку...`,
      {
        chat_id: chatId,
        message_id: statusMessage.message_id,
        parse_mode: 'HTML'
      }
    );
    
    // Отправляем карточки по одной
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const cardNumber = i + 1;
      
      try {
        console.log(`📤 Отправляю карточку ${cardNumber}/${cards.length}: ${card.id}`);
        
        // Показываем индикатор набора текста
        await bot.sendChatAction(chatId, 'typing');
        
        // Пауза перед отправкой
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Отправляем карточку
        const sent = await sendCardToBot(bot, chatId, card);
        
        if (sent) {
          successCount++;
          console.log(`✅ Карточка ${cardNumber} отправлена успешно`);
        } else {
          errorCount++;
          console.log(`❌ Карточка ${cardNumber} не отправлена`);
        }
        
        // Пауза между карточками
        if (i < cards.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (error) {
        console.error(`❌ Ошибка отправки карточки ${cardNumber}:`, error.message);
        errorCount++;
      }
    }
    
    // Отправляем итоговое сообщение
    const summaryMessage = `🎉 Отправка карточек завершена!\n\n` +
      `📊 Статистика:\n` +
      `✅ Успешно: ${successCount} карточек\n` +
      `❌ Ошибок: ${errorCount} карточек\n\n` +
      `Всего доступно: ${cardsResult.totalCards} карточек\n\n` +
      `Команды:\n` +
      `/createCards - обновить карточки\n` +
      `/get_nfts_info - собрать новые данные\n` +
      `/show_cards N - показать N карточек`;
    
    await bot.sendMessage(chatId, summaryMessage);
    
    console.log(`✅ Отправлено ${successCount} карточек для ${username}`);
    
  } catch (error) {
    console.error('❌ Ошибка в команде /show_cards:', error.message);
    
    await bot.sendMessage(
      chatId,
      `❌ Критическая ошибка:\n${error.message.substring(0, 200)}\n\nПопробуйте сначала создать карточки командой /createCards`
    );
  }
}

/**
 * Функция для отправки конкретной карточки по ID
 */
async function sendCardById(bot, chatId, cardId) {
  try {
    const cardsResult = await getCardsFromFile(100);
    
    if (!cardsResult.success) {
      return { success: false, error: cardsResult.error };
    }
    
    // Ищем карточку по ID
    const card = cardsResult.cards.find(c => c.id === cardId);
    
    if (!card) {
      return { 
        success: false, 
        error: `Карточка с ID "${cardId}" не найдена` 
      };
    }
    
    const sent = await sendCardToBot(bot, chatId, card);
    
    return {
      success: sent,
      card: card
    };
    
  } catch (error) {
    console.error('❌ Ошибка отправки карточки по ID:', error.message);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

module.exports = { 
  handleShowCards,
  sendCardById
};