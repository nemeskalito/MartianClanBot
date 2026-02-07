const fs = require('fs');
const CHAT_ID = -1003466478781;

const rulesLink = `<a href="https://t.me/c/3466478781/519">Здесь</a>`;
const banker = `<a href="https://t.me/Itraef">Здесь</a>`;
const salesBot = `<a href="https://t.me/+cZmAlq2oiPcwZWUy">Здесь</a>`;
const contests = `<a href="https://t.me/c/3466478781/6803">Здесь</a>`

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function notification(bot) {
  while (true) {  // бесконечный цикл вместо setInterval
    try {
      await bot.sendPhoto(
				CHAT_ID,
        fs.createReadStream('./public/image/martians.png'),
				{
					caption: `
• Правила группы|чата - ${rulesLink}
• Собрать расу Martian - ${banker}
• Конкурсы в группе|чате - ${contests}
• Парсер стикеров с GG - ${salesBot}
                   `,
									 parse_mode: 'HTML'
				}
      );
    } catch (err) {
      console.error('Ошибка при отправке сообщения:', err.message);
    }
    
    await delay(12 * 60 * 60 * 1000); // ждем 12 часов перед следующей отправкой
  }
}

module.exports = { notification };
