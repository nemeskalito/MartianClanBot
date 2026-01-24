
const { 
  TONAPI_KEY,
  TONCENTER_API_KEY,
  IMG_WIDTH,
  DATA_DIR,
  sleep,
  sendPhotoResized,
  safeMarkdown,
  formatDate
} = require('./utils.js');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

// ====== КОНФИГУРАЦИЯ WATCHER ======
const COLLECTION_ADDRESS = '0:463685d77d0474ec774386d92622ed688d34f07230741211d838c487dcfeec64';
const LIMIT = 1;       // проверяем по 1 NFT
const MAX_SEND = 1;    // сколько NFT отправляем за раз
const CHECK_INTERVAL = 5_000; // проверка раз в минуту
const STATE_FILE = path.join(DATA_DIR, 'watch_orcs_state.json');

let OFFSET = 26800; // стартовый offset
let watcherStarted = false;
let intervalId = null;

// ====== ЧТЕНИЕ И СОХРАНЕНИЕ СОСТОЯНИЯ ======

/**
 * Загружает состояние из файла
 */
async function loadState() {
  try {
    const data = await fs.readFile(STATE_FILE, 'utf8');
    const saved = JSON.parse(data);
    if (typeof saved.OFFSET === 'number') {
      OFFSET = saved.OFFSET;
      console.log(`✅ Загружено состояние watch_orcs: OFFSET = ${OFFSET}`);
      return true;
    }
  } catch (e) {
    // Файл не существует - это нормально при первом запуске
    console.log('ℹ️ Файл состояния watch_orcs не найден, используется значение по умолчанию');
  }
  return false;
}

/**
 * Сохраняет состояние в файл
 */
async function saveState() {
  try {
    await fs.writeFile(
      STATE_FILE,
      JSON.stringify({ 
        OFFSET,
        lastUpdated: new Date().toISOString()
      }, null, 2),
      'utf8'
    );
    console.log(`💾 Сохранено состояние watch_orcs: OFFSET = ${OFFSET}`);
  } catch (e) {
    console.error('❌ Ошибка сохранения состояния watch_orcs:', e.message);
  }
}

// ====== ФУНКЦИИ ДЛЯ РАБОТЫ С TON API ======

/**
 * Получает NFT из коллекции через TON API
 * @param {number} limit - количество NFT для получения
 * @returns {Promise<Array>} - массив NFT
 */
async function fetchNft(limit = LIMIT) {
  const url = `https://tonapi.io/v2/nfts/collections/${COLLECTION_ADDRESS}/items?limit=${limit}&offset=${OFFSET}`;
  
  try {
    const headers = TONAPI_KEY ? { 'Authorization': `Bearer ${TONAPI_KEY}` } : {};
    await sleep(300); // Задержка между запросами
    
    const { data } = await axios.get(url, { headers });
    return data.nft_items || [];
  } catch (err) {
    console.error('❌ TON API error:', err.response?.status, err.message);
    return [];
  }
}

/**
 * Фильтрует NFT по наличию атрибута "Skin Tone"
 * @param {Array} items - массив NFT
 * @returns {Array} - отфильтрованные NFT
 */
function filterSkinTone(items) {
  return items.filter(item =>
    item.metadata?.attributes?.some(
      attr => attr.trait_type === 'Skin Tone'
    )
  );
}

// ====== ФУНКЦИИ ДЛЯ РАБОТЫ WATCHER ======

/**
 * Проверяет новые NFT с Skin Tone и отправляет их
 * @param {Object} bot - экземпляр Telegram бота
 * @param {number} chatId - ID чата
 */
async function checkNewOrcs(bot, chatId) {
  try {
    console.log(`👀 Проверка новых NFT... OFFSET: ${OFFSET}`);
    
    const items = await fetchNft(LIMIT);
    
    if (items.length === 0) {
      console.log('ℹ️ NFT не найдены');
      return;
    }
    
    const newOrcs = filterSkinTone(items);
    
    if (newOrcs.length === 0) {
      console.log('ℹ️ Новых NFT с Skin Tone нет');
      return; // новых NFT нет, offset не меняем
    }
    
    console.log(`🎯 Найдено ${newOrcs.length} новых NFT с Skin Tone`);
    
    for (const item of newOrcs.slice(0, MAX_SEND)) {
      const nft = item.metadata;
      const nftName = nft.name || 'No Name';
      const nftIndex = item.index || OFFSET;
      const nftAttributes = item.metadata.attributes.map(item => `${item.trait_type} - ${item.value}`).reverse().join('\n')

      // Создаем подпись без Markdown разметки
      const caption = `🧟‍♂️ НОВЫЙ NFT!\n\n` +
                     `Название: ${safeMarkdown(nftName)}\n` +
										 `\n${nftAttributes}\n` +
                     `\nИндекс: #${nftIndex}\n` +
                     `Обнаружен: ${formatDate(new Date())}\n\n`
      
      console.log(`📤 Отправка NFT: ${nftName} (#${nftIndex})`);
      
      // Отправляем изображение
      await sendPhotoResized(bot, chatId, nft.image, caption);
      
      // Увеличиваем offset на 1
      OFFSET += 1;
      await saveState();
      
      // Делаем паузу между отправками
      await sleep(1000);
    }
    
  } catch (error) {
    console.error('❌ Ошибка в checkNewOrcs:', error.message);
    try {
      await bot.sendMessage(chatId, '❌ Произошла ошибка при проверке новых NFT');
    } catch (sendError) {
      console.error('❌ Не удалось отправить сообщение об ошибке:', sendError.message);
    }
  }
}

/**
 * Останавливает watcher
 */
function stopWatcher() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  watcherStarted = false;
  console.log('⏹️ Watcher остановлен');
}

/**
 * Запускает watcher
 * @param {Object} bot - экземпляр Telegram бота
 * @param {number} chatId - ID чата
 */
async function startWatcher(bot, chatId) {
  if (watcherStarted) {
    await bot.sendMessage(chatId, '⏳ Watcher уже запущен');
    return;
  }
  
  watcherStarted = true;
  
  // Загружаем состояние
  await loadState();
  
  await bot.sendMessage(chatId, 
    `👀 Начинаю следить за новыми NFT с атрибутом "Skin Tone"...\n` +
    `📊 Стартовый offset: ${OFFSET}\n` +
    `⏱️ Проверка каждые ${CHECK_INTERVAL/1000} секунд`
  );
  
  // Первая проверка сразу
  await checkNewOrcs(bot, chatId);
  
  // Запускаем периодическую проверку
  intervalId = setInterval(() => {
    checkNewOrcs(bot, chatId);
  }, CHECK_INTERVAL);
  
  console.log(`✅ Watcher запущен для чата ${chatId}, OFFSET: ${OFFSET}`);
}

// ====== ОСНОВНАЯ ФУНКЦИЯ-ОБРАБОТЧИК КОМАНДЫ ======

/**
 * Обработчик команды /watch_orcs
 * @param {Object} bot - экземпляр Telegram бота
 * @param {Object} msg - объект сообщения Telegram
 */
async function handleWatchOrcs(bot, msg) {
  const chatId = msg.chat.id;
  
  try {
    // Проверяем, запущен ли уже watcher
    if (watcherStarted) {
      const keyboard = {
        reply_markup: {
          inline_keyboard: [[
            { text: '⏹️ Остановить', callback_data: 'stop_watcher' },
            { text: '📊 Статус', callback_data: 'watcher_status' }
          ]]
        }
      };
      
      await bot.sendMessage(chatId, 
        `👀 Watcher уже запущен\n` +
        `📊 Текущий offset: ${OFFSET}\n` +
        `🔄 Проверка каждые ${CHECK_INTERVAL/1000} секунд`,
        keyboard
      );
      return;
    }
    
    // Запускаем watcher
    await startWatcher(bot, chatId);
    
  } catch (error) {
    console.error('❌ Ошибка в handleWatchOrcs:', error);
    await bot.sendMessage(chatId, '❌ Произошла ошибка при запуске watcher');
  }
}

/**
 * Обработчик команды /stop_watch
 * @param {Object} bot - экземпляр Telegram бота
 * @param {Object} msg - объект сообщения Telegram
 */
async function handleStopWatch(bot, msg) {
  const chatId = msg.chat.id;
  
  try {
    if (!watcherStarted) {
      await bot.sendMessage(chatId, 'ℹ️ Watcher не запущен');
      return;
    }
    
    stopWatcher();
    await bot.sendMessage(chatId, 
      `⏹️ Watcher остановлен\n` +
      `📊 Последний offset: ${OFFSET}\n` +
      `🔄 Для повторного запуска используйте /watch_orcs`
    );
    
  } catch (error) {
    console.error('❌ Ошибка в handleStopWatch:', error);
    await bot.sendMessage(chatId, '❌ Произошла ошибка при остановке watcher');
  }
}

/**
 * Обработчик команды /watcher_status
 * @param {Object} bot - экземпляр Telegram бота
 * @param {Object} msg - объект сообщения Telegram
 */
async function handleWatcherStatus(bot, msg) {
  const chatId = msg.chat.id;
  
  try {
    const status = watcherStarted ? '✅ Активен' : '⏹️ Остановлен';
    const nextCheck = watcherStarted ? 
      `🔄 Следующая проверка через ${CHECK_INTERVAL/1000} секунд` : 
      '⏳ Запустите /watch_orcs для начала работы';
    
    await bot.sendMessage(chatId, 
      `📊 Статус Watcher:\n\n` +
      `Состояние: ${status}\n` +
      `Текущий offset: ${OFFSET}\n` +
      `${nextCheck}\n\n` +
      `🎯 Отслеживается атрибут: Skin Tone\n` +
      `🏷️ Коллекция: ${COLLECTION_ADDRESS.substring(0, 20)}...`
    );
    
  } catch (error) {
    console.error('❌ Ошибка в handleWatcherStatus:', error);
    await bot.sendMessage(chatId, '❌ Произошла ошибка при получении статуса');
  }
}

/**
 * Обработчик callback-запросов для кнопок watcher
 * @param {Object} bot - экземпляр Telegram бота
 * @param {Object} callbackQuery - объект callback запроса
 */
async function handleWatcherCallback(bot, callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const data = callbackQuery.data;
  
  try {
    if (data === 'stop_watcher') {
      if (!watcherStarted) {
        await bot.answerCallbackQuery(callbackQuery.id, { text: 'Watcher уже остановлен' });
        return;
      }
      
      stopWatcher();
      
      // Обновляем сообщение
      await bot.editMessageText(
        `⏹️ Watcher остановлен по запросу\n` +
        `📊 Последний offset: ${OFFSET}`,
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: {
            inline_keyboard: [[
              { text: '▶️ Запустить снова', callback_data: 'start_watcher' }
            ]]
          }
        }
      );
      
      await bot.answerCallbackQuery(callbackQuery.id, { text: 'Watcher остановлен' });
      
    } else if (data === 'watcher_status') {
      const status = watcherStarted ? '✅ Активен' : '⏹️ Остановлен';
      await bot.answerCallbackQuery(callbackQuery.id, { 
        text: `Статус: ${status}, Offset: ${OFFSET}` 
      });
      
    } else if (data === 'start_watcher') {
      if (watcherStarted) {
        await bot.answerCallbackQuery(callbackQuery.id, { text: 'Watcher уже запущен' });
        return;
      }
      
      await startWatcher(bot, chatId);
      
      // Обновляем сообщение
      await bot.editMessageText(
        `👀 Watcher запущен\n` +
        `📊 Текущий offset: ${OFFSET}\n` +
        `🔄 Проверка каждые ${CHECK_INTERVAL/1000} секунд`,
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: {
            inline_keyboard: [[
              { text: '⏹️ Остановить', callback_data: 'stop_watcher' },
              { text: '📊 Статус', callback_data: 'watcher_status' }
            ]]
          }
        }
      );
      
      await bot.answerCallbackQuery(callbackQuery.id, { text: 'Watcher запущен' });
    }
    
  } catch (error) {
    console.error('❌ Ошибка в handleWatcherCallback:', error);
    await bot.answerCallbackQuery(callbackQuery.id, { text: 'Ошибка при обработке запроса' });
  }
}

// ====== ЭКСПОРТ ======
module.exports = {
  handleWatchOrcs,
  handleStopWatch,
  handleWatcherStatus,
  handleWatcherCallback,
  
  // Экспортируем состояние для отладки
  getWatcherState: () => ({
    started: watcherStarted,
    offset: OFFSET,
    interval: CHECK_INTERVAL
  })
};
