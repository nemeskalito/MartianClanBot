// modules/antiLinks.js

function initAntiLinks(bot) {
  // Проверка текста на ссылку
  function containsLink(text) {
    return /(https?:\/\/[^\s]+)|(www\.[^\s]+)/i.test(text);
  }

  // Обработка сообщений
  bot.on('message', async (msg) => {
    if (!msg.text || !msg.from) return;

    const chatId = msg.chat.id;
    const userId = msg.from.id;

    try {
      // Игнорируем админов
      const member = await bot.getChatMember(chatId, userId);
      if (['administrator', 'creator'].includes(member.status)) return;

      if (containsLink(msg.text)) {
        // Пытаемся удалить сообщение
        try {
          await bot.deleteMessage(chatId, msg.message_id);
        } catch (err) {
          console.log('⚠️ Не удалось удалить сообщение (частная группа или права ограничены)');
        }

        // Отправляем предупреждение участнику
        await bot.sendMessage(chatId, `⚠️ ${msg.from.first_name}, ссылки запрещены!`);
      }

    } catch (err) {
      console.log('Антиссылка ошибка:', err.description || err.message);
    }
  });
}

module.exports = { initAntiLinks };
