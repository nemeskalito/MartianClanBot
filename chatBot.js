const TelegramBot = require('node-telegram-bot-api');

require('dotenv').config();
const { initAntiLinks } = require('./modules/antiLinks.js');
const { initGreeting } = require('./modules/greeting.js');
const { notification } = require('./modules/notification.js');

const bot = new TelegramBot(process.env.API_CHATBOT, { polling: true });

initAntiLinks(bot);
initGreeting(bot);
notification(bot)