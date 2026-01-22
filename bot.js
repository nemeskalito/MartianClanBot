require('dotenv').config()
const TelegramBot = require('node-telegram-bot-api')

// Создаём бота с polling
const bot = new TelegramBot(process.env.API_TOKEN, { polling: true })

console.log('Бот запущен')

// Реагируем на команду /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id
  const username = msg.from.username || msg.from.first_name
  console.log(`Команда /start от ${username}`)
  bot.sendMessage(chatId, `Привет, ${username}! Я эхо-бот.`)
})

// Обрабатываем все текстовые сообщения (включая группы)
bot.on('message', (msg) => {
  const chatId = msg.chat.id
  const text = msg.text
  const username = msg.from.username || msg.from.first_name

  // Игнорируем пустые сообщения
  if (!text) return

  console.log(`От ${username} в чате ${chatId}: ${text}`)

  // Отправляем ответ в чат
  bot.sendMessage(chatId, `Вы сказали: "${text}"`)
})

