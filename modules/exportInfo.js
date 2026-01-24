const fs = require('fs').promises;
const path = require('path');
const { MAIN_DATA_FILE, ensureDataDir } = require('./utils.js');

async function getRecordsCount() {
  try {
    const fileContent = await fs.readFile(MAIN_DATA_FILE, 'utf8');
    const data = JSON.parse(fileContent);
    return Array.isArray(data) ? data.length : 0;
  } catch (err) {
    return 0;
  }
}

async function handleExportInfo(bot, msg) {
  const chatId = msg.chat.id;
  const username = msg.from.username || `user_${msg.from.id}`;

  try {
    console.log(`📤 Пользователь ${username} запросил экспорт данных`);
    await bot.sendMessage(chatId, '📁 Подготавливаю файл для экспорта...');

    // Убеждаемся что папка существует
    await ensureDataDir();
    
    // Проверяем существует ли файл
    try {
      await fs.access(MAIN_DATA_FILE);
      console.log(`✅ Файл найден: ${MAIN_DATA_FILE}`);
    } catch (err) {
      console.log(`❌ Файл не найден: ${MAIN_DATA_FILE}`);
      return bot.sendMessage(
        chatId, 
        '📭 Файл с данными пока пуст.\n\nИспользуйте /get_nfts_info сначала для сбора данных.'
      );
    }

    // Получаем статистику файла
    const stats = await fs.stat(MAIN_DATA_FILE);
    const fileSize = (stats.size / 1024).toFixed(2);
    const recordsCount = await getRecordsCount();
    
    console.log(`📊 Статистика файла: ${recordsCount} записей, ${fileSize} KB`);

    // Отправляем файл пользователю
    console.log(`📨 Отправляю файл пользователю ${username}...`);
    await bot.sendDocument(
      chatId,
      MAIN_DATA_FILE,
      {
        caption: `📁 Экспорт всех сохраненных данных о NFT\n\n` +
                 `🗂️ Файл: all_nft_info.json\n` +
                 `📊 Записей: ${recordsCount}\n` +
                 `💾 Размер: ${fileSize} KB\n` +
                 `⏰ Обновлен: ${new Date(stats.mtime).toLocaleString()}`
      }
    );

    console.log(`✅ Файл успешно экспортирован для ${username}`);

  } catch (error) {
    console.error('❌ Ошибка экспорта:', error.message);
    console.error('❌ Stack trace:', error.stack);
    
    // Отправляем подробное сообщение об ошибке
    let errorMessage = `❌ Ошибка при экспорте файла\n\n`;
    
    if (error.code === 'ENOENT') {
      errorMessage += `Файл данных не найден.\nИспользуйте /get_nfts_info для создания данных.`;
    } else if (error.message.includes('file is too big')) {
      errorMessage += `Файл слишком большой для Telegram.\nИспользуйте /stats для просмотра данных.`;
    } else {
      errorMessage += `Техническая информация:\n${error.message}`;
    }
    
    await bot.sendMessage(chatId, errorMessage);
  }
}

module.exports = { handleExportInfo };