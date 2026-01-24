const fs = require('fs').promises;
const { MAIN_DATA_FILE, ensureDataDir, createBackup } = require('./utils.js');

async function clearDataFile() {
  try {
    console.log('🔄 Начинаю очистку файла данных...');
    
    // Убеждаемся что папка существует
    await ensureDataDir();
    
    // Создаем backup перед очисткой
    console.log('💾 Создаю backup...');
    const backupResult = await createBackup();
    
    // Создаем новый файл с пустым массивом
    console.log(`🗑️ Очищаю файл: ${MAIN_DATA_FILE}`);
    await fs.writeFile(MAIN_DATA_FILE, JSON.stringify([], null, 2), 'utf8');
    
    // Проверяем что файл пустой
    const fileContent = await fs.readFile(MAIN_DATA_FILE, 'utf8');
    const data = JSON.parse(fileContent);
    
    console.log(`✅ Файл данных очищен. Проверка: ${Array.isArray(data) && data.length === 0 ? 'OK' : 'ERROR'}`);
    
    return { success: true };
    
  } catch (error) {
    console.error('❌ Ошибка очистки файла:', error.message);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

async function handleClearInfo(bot, msg) {
  const chatId = msg.chat.id;
  
  console.log(`👤 Пользователь ${msg.from.username || msg.from.id} запросил очистку данных`);

  // Кнопки для подтверждения
  const options = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Да, очистить', callback_data: 'clear_confirm' },
          { text: '❌ Нет, отмена', callback_data: 'clear_cancel' }
        ]
      ]
    }
  };

  await bot.sendMessage(
    chatId,
    '⚠️ Внимание: Очистка данных\n\n' +
    'Вы уверены, что хотите удалить ВСЕ сохраненные данные?\n' +
    'Это действие невозможно отменить.\n\n' +
    'Файл nft_data/all_nft_info.json будет полностью очищен.',
    options
  );
}

async function handleClearCallback(bot, callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const data = callbackQuery.data;
  const username = callbackQuery.from.username || `user_${callbackQuery.from.id}`;

  try {
    console.log(`🔄 Обработка callback: ${data} от ${username}`);
    
    if (data === 'clear_confirm') {
      // Очищаем данные
      console.log(`🗑️ Начинаю очистку данных по запросу ${username}...`);
      const clearResult = await clearDataFile();
      
      if (clearResult.success) {
        await bot.editMessageText(
          '✅ Данные успешно очищены!\n\n' +
          'Файл nft_data/all_nft_info.json теперь пуст.',
          {
            chat_id: chatId,
            message_id: messageId
          }
        );
        console.log(`✅ Данные очищены по запросу ${username}`);
      } else {
        await bot.editMessageText(
          `❌ Ошибка очистки:\n${clearResult.error}`,
          {
            chat_id: chatId,
            message_id: messageId
          }
        );
        console.error(`❌ Ошибка очистки: ${clearResult.error}`);
      }

    } else if (data === 'clear_cancel') {
      await bot.editMessageText(
        '❌ Очистка отменена\n\nДанные сохранены.',
        {
          chat_id: chatId,
          message_id: messageId
        }
      );
      console.log(`❌ Очистка отменена пользователем ${username}`);
    }

    // Подтверждаем обработку callback
    await bot.answerCallbackQuery(callbackQuery.id, { 
      text: data === 'clear_confirm' ? 'Данные очищены' : 'Очистка отменена' 
    });

  } catch (error) {
    console.error('❌ Ошибка обработки callback:', error);
    await bot.answerCallbackQuery(callbackQuery.id, { text: 'Ошибка при обработке запроса' });
    
    // Пытаемся отправить сообщение об ошибке
    try {
      await bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`);
    } catch (sendError) {
      console.error('❌ Не удалось отправить сообщение об ошибке:', sendError);
    }
  }
}

module.exports = { handleClearInfo, handleClearCallback };