// modules/greeting.js
/**
 * Инициализация приветствия новых участников
 * @param {TelegramBot} bot - экземпляр Telegram бота
 * @param {string} [gifPath] - путь к GIF или видео для приветствия
 */
function initGreeting(bot, gifPath = './public/image/greeting.mp4') {
  bot.on('new_chat_members', async (msg) => {
    const chatId = msg.chat.id;

    for (const user of msg.new_chat_members) {
      const name = user.first_name || 'новичок';

      try {
        // Отправляем GIF/видео
        await bot.sendAnimation(chatId, gifPath);

        // Отправляем приветственное сообщение
        await bot.sendMessage(chatId, `Приветствуем, ${name}!\nДобро пожаловать в клан Martian!`);
      } catch (err) {
        console.log('Ошибка отправки приветствия:', err.description || err.message);
      }
    }
  });
}

module.exports = { initGreeting };
