const fs = require('fs').promises;
const path = require('path');
const { MAIN_DATA_FILE, ensureDataDir } = require('./utils.js');

async function getDataStats() {
  try {
    // Убеждаемся что папка существует
    await ensureDataDir();
    
    // Проверяем существует ли файл
    try {
      await fs.access(MAIN_DATA_FILE);
    } catch (err) {
      return { success: false, error: 'Нет данных' };
    }
    
    const fileContent = await fs.readFile(MAIN_DATA_FILE, 'utf8');
    const allData = JSON.parse(fileContent);
    
    if (!Array.isArray(allData) || allData.length === 0) {
      return { success: false, error: 'Нет данных' };
    }
    
    const stats = await fs.stat(MAIN_DATA_FILE);
    const fileSize = (stats.size / 1024).toFixed(2);
    
    // Подсчет уникальных значений
    const uniqueNFTs = [...new Set(allData.map(item => item.address))].length;
    const uniqueOwners = [...new Set(allData.map(item => item.owner_address))].length;
    const uniqueUsers = [...new Set(allData.map(item => 
      item.user?.username || item.user?.userId || 'unknown'
    ))].length;
    
    // Последние записи (уникальные по адресу)
    const uniqueEntries = [];
    const seenAddresses = new Set();
    
    for (let i = allData.length - 1; i >= 0 && uniqueEntries.length < 5; i--) {
      const item = allData[i];
      if (!seenAddresses.has(item.address)) {
        seenAddresses.add(item.address);
        uniqueEntries.unshift(item); // Добавляем в начало чтобы сохранить порядок
      }
    }
    
    // Форматируем последние записи для безопасного вывода
    const recentEntries = uniqueEntries.slice(-5).reverse().map((entry, index) => {
      // Экранируем символы которые могут сломать Markdown
      const safeName = entry.name.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
      return `${index + 1}. ${safeName} (#${entry.nft_index}) - ${new Date(entry.timestamp).toLocaleTimeString()}`;
    }).join('\n');
    
    return {
      success: true,
      totalRecords: allData.length,
      uniqueNFTs: uniqueNFTs,
      uniqueOwners: uniqueOwners,
      uniqueUsers: uniqueUsers,
      fileSize: fileSize,
      firstRecord: allData[0]?.timestamp,
      lastRecord: allData[allData.length - 1]?.timestamp,
      recentEntries: recentEntries,
      lastModified: stats.mtime
    };
    
  } catch (error) {
    console.error('❌ Ошибка получения статистики:', error.message);
    return { 
      success: false, 
      error: 'Ошибка чтения файла данных' 
    };
  }
}

async function handleShowStats(bot, msg) {
  const chatId = msg.chat.id;

  try {
    await bot.sendMessage(chatId, '📊 Собираю статистику...');

    const statsResult = await getDataStats();
    
    if (!statsResult.success) {
      return bot.sendMessage(chatId, `📭 ${statsResult.error}`);
    }

    // Формируем сообщение БЕЗ Markdown для безопасности
    const statsMessage = `📊 Статистика сохраненных данных NFT\n\n` +
      `📈 Всего записей: ${statsResult.totalRecords}\n` +
      `👥 Уникальных пользователей: ${statsResult.uniqueUsers}\n` +
      `🎯 Уникальных NFT: ${statsResult.uniqueNFTs}\n` +
      `👤 Уникальных владельцев: ${statsResult.uniqueOwners}\n\n` +
      `🗂️ Файл: nft_data/all_nft_info.json\n` +
      `💾 Размер файла: ${statsResult.fileSize} KB\n` +
      `⏰ Обновлен: ${new Date(statsResult.lastModified).toLocaleString()}\n\n` +
      `📅 Первая запись: ${new Date(statsResult.firstRecord).toLocaleDateString()}\n` +
      `📅 Последняя запись: ${new Date(statsResult.lastRecord).toLocaleString()}\n\n` +
      `Последние 5 уникальных NFT:\n${statsResult.recentEntries}\n\n` +
      `Используйте /export_info для скачивания файла`;

    // Отправляем БЕЗ parse_mode: 'Markdown'
    await bot.sendMessage(chatId, statsMessage);

  } catch (error) {
    console.error('❌ Ошибка получения статистики:', error.message);
    await bot.sendMessage(
      chatId, 
      '❌ Ошибка при получении статистики'
    );
  }
}

module.exports = { handleShowStats };