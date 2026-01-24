const { API_TOKEN } = require('./modules/utils.js');
const TelegramBot = require('node-telegram-bot-api');

// Импорт модулей команд
const { handleNewMartian } = require('./modules/fetchMartians.js');
const { handleGetNftsInfo } = require('./modules/getNftInfo.js');
const { handleExportInfo } = require('./modules/exportInfo.js');
const { handleShowStats } = require('./modules/showStats.js');
const { handleClearInfo, handleClearCallback } = require('./modules/clearInfo.js');
const { handleShowCards } = require('./modules/showCards.js');
const { COLLECTION_ADDRESS_UF } = require('./modules/utils.js');

// ДОБАВЛЕНИЕ watchOrcs.js:
const { 
  handleWatchOrcs, 
  handleStopWatch, 
  handleWatcherStatus,
  handleWatcherCallback 
} = require('./modules/watchOrcs.js');


// ====== BOT INIT ======
const bot = new TelegramBot(API_TOKEN, { polling: true });

// ====== РЕГИСТРАЦИЯ КОМАНД ======

// Команда /new_martian
bot.onText(/\/new_martian/, async (msg) => {
  try {
    await handleNewMartian(bot, msg);
  } catch (error) {
    console.error('Ошибка в команде /new_martian:', error);
    bot.sendMessage(msg.chat.id, '❌ Произошла ошибка при выполнении команды');
  }
});

// Команда /get_nfts_info или /getnftsinfo (оба варианта)
bot.onText(/\/(get_nfts_info|getnftsinfo)/, async (msg) => {
  try {
    await handleGetNftsInfo(bot, msg);
  } catch (error) {
    console.error('Ошибка в команде get_nfts_info:', error);
    bot.sendMessage(msg.chat.id, '❌ Произошла ошибка при выполнении команды');
  }
});

// Команда /export_info или /exportinfo (оба варианта)
bot.onText(/\/(export_info|exportinfo)/, async (msg) => {
  try {
    await handleExportInfo(bot, msg);
  } catch (error) {
    console.error('Ошибка в команде export_info:', error);
    bot.sendMessage(msg.chat.id, '❌ Произошла ошибка при выполнении команды');
  }
});

// Команда /stats
bot.onText(/\/stats/, async (msg) => {
  try {
    await handleShowStats(bot, msg);
  } catch (error) {
    console.error('Ошибка в команде /stats:', error);
    bot.sendMessage(msg.chat.id, '❌ Произошла ошибка при выполнении команды');
  }
});

// Команда /clear_info или /clearinfo (оба варианта)
bot.onText(/\/(clear_info|clearinfo)/, async (msg) => {
  try {
    await handleClearInfo(bot, msg);
  } catch (error) {
    console.error('Ошибка в команде clear_info:', error);
    bot.sendMessage(msg.chat.id, '❌ Произошла ошибка при выполнении команды');
  }
});

// Команда /show_cards
bot.onText(/\/show_cards/, async (msg) => {
  try {
    await handleShowCards(bot, msg);
  } catch (error) {
    console.error('Ошибка в команде /show_cards:', error);
    bot.sendMessage(msg.chat.id, '❌ Произошла ошибка при выполнении команды');
  }
});

// Команда /show_cards с параметром количества
bot.onText(/\/show_cards (\d+)/, async (msg, match) => {
  try {
    await handleShowCards(bot, msg);
  } catch (error) {
    console.error('Ошибка в команде /show_cards:', error);
    bot.sendMessage(msg.chat.id, '❌ Произошла ошибка при выполнении команды');
  }
});


// ДОБАВИТЬ ЭТИ КОМАНДЫ:

// Команда /watch_orcs
bot.onText(/\/watch_orcs/, async (msg) => {
  try {
    await handleWatchOrcs(bot, msg);
  } catch (error) {
    console.error('Ошибка в команде /watch_orcs:', error);
    bot.sendMessage(msg.chat.id, '❌ Произошла ошибка при выполнении команды');
  }
});

// Команда /stop_watch
bot.onText(/\/stop_watch/, async (msg) => {
  try {
    await handleStopWatch(bot, msg);
  } catch (error) {
    console.error('Ошибка в команде /stop_watch:', error);
    bot.sendMessage(msg.chat.id, '❌ Произошла ошибка при выполнении команды');
  }
});

// Команда /watcher_status
bot.onText(/\/watcher_status/, async (msg) => {
  try {
    await handleWatcherStatus(bot, msg);
  } catch (error) {
    console.error('Ошибка в команде /watcher_status:', error);
    bot.sendMessage(msg.chat.id, '❌ Произошла ошибка при выполнении команды');
  }
});



// Обработка callback-запросов (для кнопок)
bot.on('callback_query', async (callbackQuery) => {
  try {
    const data = callbackQuery.data;
    
    // Проверяем, относится ли callback к команде clear_info/clearinfo
    if (data === 'clear_confirm' || data === 'clear_cancel') {
      await handleClearCallback(bot, callbackQuery);
    } 
    // Проверяем, относится ли callback к watcher
    else if (data.startsWith('watcher_') || data === 'stop_watcher' || 
             data === 'start_watcher') {
      await handleWatcherCallback(bot, callbackQuery);
    } 
    else {
      await bot.answerCallbackQuery(callbackQuery.id, { text: 'Неизвестная команда' });
    }
  } catch (error) {
    console.error('Ошибка обработки callback:', error);
    await bot.answerCallbackQuery(callbackQuery.id, { text: 'Ошибка при обработке запроса' });
  }
});

// ====== КОМАНДА /start ======
bot.onText(/\/start/, (msg) => {

  const chatId = msg.chat.id;
  
  const startText = `🎉 Добро пожаловать в Martian NFT Bot!

Я помогаю отслеживать NFT коллекцию в сети TON.

Для начала работы используйте:
👉 /get_nfts_info или /getnftsinfo - собрать данные о NFT
👉 /new_martian - найти Martian NFT
👉 /show_cards или /showcards - показать карточки NFT
👉 /help - полная справка по командам

Быстрый старт:
1. Отправьте /get_nfts_info
2. Дождитесь сбора данных
3. Просмотрите карточки /show_cards
4. Проверьте статистику /stats

Коллекция: ${COLLECTION_ADDRESS_UF}
Данные сохраняются в: nft_data/`;

  bot.sendMessage(chatId, startText, {
    parse_mode: undefined,
    disable_web_page_preview: true
  });
});

// ====== КОМАНДА /help (без Markdown) ======
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  
  const helpText = `🤖 Martian NFT Bot - Полная справка по командам

🃏 Основные команды:

1. /new_martian
   👽 Находит последние NFT с атрибутом "Martian"
   • Показывает до 5 NFT с изображениями

2. /get_nfts_info или /getnftsinfo
   📡 Собирает информацию о 10 случайных NFT
   • Сохраняет в базу данных
   • Проверяет дубликаты

3. /show_cards [число]
   🎴 Показывает красивые карточки NFT
   • По умолчанию 3 карточки
   • Можно указать количество: /show_cards 5
   • Карточки в рамках с атрибутами

4. /export_info или /exportinfo
   📁 Экспортирует базу данных в файл
   • Отправляет файл all_nft_info.json

5. /stats
   📊 Показывает статистику базы данных
   • Всего записей
   • Уникальных NFT
   • Размер файла

6. /clear_info или /clearinfo
   🗑️ Очищает базу данных
   • Требует подтверждения
`;

  bot.sendMessage(chatId, helpText, {
    parse_mode: undefined, // Без разметки
    disable_web_page_preview: true
  });
});

// ====== ОБРАБОТКА ОШИБОК ======
bot.on('polling_error', (error) => {
  console.error('❌ Polling error:', error);
});

bot.on('webhook_error', (error) => {
  console.error('❌ Webhook error:', error);
});

// ====== ЗАПУСК БОТА ======
async function startBot() {
  console.log('🤖 Запуск бота annskv...');
  
  const { ensureDataDir } = require('./modules/utils.js');
  await ensureDataDir();
  
  console.log('✅ Бот успешно запущен!');
  console.log('📋 Доступные команды:');
  console.log('   /new_martian - поиск Martian NFT');
  console.log('   /get_nfts_info или /getnftsinfo - сбор данных о 10 NFT');
  console.log('   /show_cards - показать карточки NFT');
  console.log('   /export_info или /exportinfo - экспорт файла');
  console.log('   /stats - статистика');
  console.log('   /clear_info или /clearinfo - очистка данных');
  console.log('   /watch_orcs - следить за новыми NFT с Skin Tone'); // ДОБАВИТЬ
  console.log('   /stop_watch - остановить watcher'); // ДОБАВИТЬ
  console.log('   /watcher_status - статус watcher'); // ДОБАВИТЬ
  console.log('   /help - подробная справка');
  console.log('   /start - приветственное сообщение');
  console.log('📁 Данные сохраняются в папку: nft_data/');
}

// Запускаем бота
startBot();