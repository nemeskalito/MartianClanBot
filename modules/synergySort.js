
const { 
  MAIN_DATA_FILE,
  DATA_DIR,
  ensureDataDir,
  escapeMarkdown,
  truncateText,
  formatFileSize
} = require('./utils.js');
const fs = require('fs').promises;
const path = require('path');

// ====== КОНСТАНТЫ И КОНФИГУРАЦИЯ ======

const ATTRIBUTES_POWER_FILE = path.join(DATA_DIR, 'attributes_power_data.json');
const SYNERGY_STATE_FILE = path.join(DATA_DIR, 'synergy_state.json');

// Минимальные совпадения для синергии
const SYNERGY_OPTIONS = [2, 3];

// ====== ЗАГРУЗКА ДАННЫХ ======

/**
 * Загружает данные о силе атрибутов
 */
async function loadAttributesPowerData() {
  try {
    console.log(`📁 Загрузка данных атрибутов из: ${ATTRIBUTES_POWER_FILE}`);
    await ensureDataDir();
    
    const data = await fs.readFile(ATTRIBUTES_POWER_FILE, 'utf8');
    const parsed = JSON.parse(data);
    
    // Извлекаем данные о Skin Tone
    const skinTones = parsed.attributes_power?.attributes?.["Skin Tone"];
    if (!skinTones) {
      console.error('❌ Не найдены данные Skin Tone в файле атрибутов');
      return [];
    }
    
    // Преобразуем в массив объектов
    const skinToneList = Object.entries(skinTones).map(([name, rarity]) => ({
      name,
      rarity,
      selected: false
    }));
    
    console.log(`✅ Загружено ${skinToneList.length} вариантов Skin Tone`);
    return skinToneList;
    
  } catch (error) {
    console.error('❌ Ошибка загрузки данных атрибутов:', error.message);
    
    // Возвращаем стандартный список если файл не найден
    return [
      { name: "Golden", rarity: "Legendary", selected: false },
      { name: "Lunar", rarity: "Legendary", selected: false },
      { name: "Cosmic", rarity: "Legendary", selected: false },
      { name: "Demonic", rarity: "Legendary", selected: false },
      { name: "Cavern", rarity: "Epic", selected: false },
      { name: "Desert", rarity: "Epic", selected: false },
      { name: "Fairytale", rarity: "Epic", selected: false },
      { name: "Martian", rarity: "Epic", selected: false },
      { name: "Magical", rarity: "Epic", selected: false },
      { name: "Silver", rarity: "Epic", selected: false },
      { name: "Forest", rarity: "Common", selected: false },
      { name: "Urban", rarity: "Common", selected: false },
      { name: "Beach", rarity: "Common", selected: false },
      { name: "Mountain", rarity: "Common", selected: false },
      { name: "Meadow", rarity: "Common", selected: false },
      { name: "Swamp", rarity: "Common", selected: false },
      { name: "Tropical", rarity: "Common", selected: false },
      { name: "Taiga", rarity: "Common", selected: false }
    ];
  }
}

/**
 * Загружает данные NFT из файла
 */
async function loadNftData() {
  try {
    console.log(`📁 Загрузка NFT данных из: ${MAIN_DATA_FILE}`);
    await ensureDataDir();
    
    const data = await fs.readFile(MAIN_DATA_FILE, 'utf8');
    const parsed = JSON.parse(data);
    
    console.log(`✅ Загружено ${parsed.length} NFT`);
    return parsed;
    
  } catch (error) {
    console.error('❌ Ошибка загрузки данных NFT:', error.message);
    return [];
  }
}

/**
 * Загружает состояние сортировки
 */
async function loadSynergyState() {
  try {
    const data = await fs.readFile(SYNERGY_STATE_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // Возвращаем состояние по умолчанию
    return {
      synergyLevel: 2,
      selectedSkinTones: [],
      lastSearch: null
    };
  }
}

/**
 * Сохраняет состояние сортировки
 */
async function saveSynergyState(state) {
  try {
    await fs.writeFile(
      SYNERGY_STATE_FILE,
      JSON.stringify(state, null, 2),
      'utf8'
    );
  } catch (error) {
    console.error('❌ Ошибка сохранения состояния:', error.message);
  }
}

// ====== ФУНКЦИИ ДЛЯ СОЗДАНИЯ ИНТЕРФЕЙСА ======

/**
 * Создает клавиатуру с выбором параметров
 * @param {number} synergyLevel - выбранный уровень синергии
 * @param {Array} skinTones - список Skin Tone с состоянием выбора
 * @param {number} page - текущая страница для Skin Tone
 */
function createSelectionKeyboard(synergyLevel, skinTones, page = 0) {
  const ITEMS_PER_PAGE = 8;
  const startIndex = page * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentSkinTones = skinTones.slice(startIndex, endIndex);
  
  const inlineKeyboard = [];
  
  // Секция 1: Выбор синергии
  inlineKeyboard.push([
    {
      text: synergyLevel === 2 ? "✅ 2+ совпадения" : "2+ совпадения",
      callback_data: "synergy_select_2"
    },
    {
      text: synergyLevel === 3 ? "✅ 3+ совпадения" : "3+ совпадения",
      callback_data: "synergy_select_3"
    }
  ]);
  
  inlineKeyboard.push([{ text: "🎯 Секция: Synergy", callback_data: "synergy_section" }]);
  
  // Секция 2: Выбор Skin Tone
  inlineKeyboard.push([{ text: "🎨 Секция: Skin Tone", callback_data: "skin_section" }]);
  
  // Кнопки для Skin Tone (по 2 в строку)
  for (let i = 0; i < currentSkinTones.length; i += 2) {
    const row = [];
    
    for (let j = 0; j < 2; j++) {
      if (i + j < currentSkinTones.length) {
        const tone = currentSkinTones[i + j];
        const icon = tone.selected ? "✅" : "⬜";
        const buttonText = `${icon} ${tone.name}`;
        
        row.push({
          text: buttonText,
          callback_data: `skin_toggle_${tone.name}_${page}`
        });
      }
    }
    
    if (row.length > 0) {
      inlineKeyboard.push(row);
    }
  }
  
  // Кнопки навигации для Skin Tone
  const navRow = [];
  
  if (page > 0) {
    navRow.push({
      text: "⬅️ Предыдущие",
      callback_data: `skin_page_${page - 1}`
    });
  }
  
  if (endIndex < skinTones.length) {
    navRow.push({
      text: "Следующие ➡️",
      callback_data: `skin_page_${page + 1}`
    });
  }
  
  if (navRow.length > 0) {
    inlineKeyboard.push(navRow);
  }
  
  // Кнопки выбора всех/очистки
  inlineKeyboard.push([
    {
      text: "📥 Выбрать все",
      callback_data: `skin_select_all_${page}`
    },
    {
      text: "🗑️ Очистить все",
      callback_data: `skin_clear_all_${page}`
    }
  ]);
  
  // Главные кнопки действий
  inlineKeyboard.push([
    {
      text: "🔄 Сортировать",
      callback_data: "synergy_sort_execute"
    },
    {
      text: "📊 Статистика",
      callback_data: "synergy_stats"
    }
  ]);
  
  return inlineKeyboard;
}

/**
 * Создает сообщение с текущими настройками
 */
function createSelectionMessage(synergyLevel, skinTones, page = 0) {
  const selectedSkinTones = skinTones.filter(tone => tone.selected);
  const selectedCount = selectedSkinTones.length;
  const totalCount = skinTones.length;
  
  let message = "🔍 *Сортировка NFT по синергии*\n\n";
  
  message += "🎯 *Параметры поиска:*\n";
  message += `• Синергия: ${synergyLevel}+ совпадения атрибутов\n`;
  message += `• Skin Tone: ${selectedCount > 0 ? selectedCount + ' выбрано' : 'Все'}\n`;
  
  if (selectedCount > 0) {
    message += "• Выбраны: ";
    const toneNames = selectedSkinTones.map(t => t.name).slice(0, 5);
    message += toneNames.join(", ");
    if (selectedCount > 5) {
      message += ` ... и еще ${selectedCount - 5}`;
    }
    message += "\n";
  }
  
  message += `\n📊 *Статистика базы:*\n`;
  message += `• Всего NFT в базе: ${totalCount}\n`;
  message += `• Skin Tone вариантов: ${skinTones.length}\n`;
  
  message += "\n💡 *Как работает:*\n";
  message += "1. Выберите уровень синергии (2 или 3+ совпадений)\n";
  message += "2. Выберите нужные Skin Tone (или оставьте все)\n";
  message += "3. Нажмите 'Сортировать' для поиска\n";
  message += "4. Результаты будут отсортированы по синергии\n";
  
  message += "\n🔄 *Управление:*\n";
  message += "• Нажмите на Skin Tone для выбора/снятия\n";
  message += "• Используйте кнопки навигации для просмотра\n";
  message += "• 'Выбрать все' / 'Очистить все' - массовые операции\n";
  
  return message;
}

// ====== ФУНКЦИИ ПОИСКА И СОРТИРОВКИ ======

/**
 * Находит NFT с указанными параметрами
 * @param {Array} nfts - массив NFT
 * @param {number} synergyLevel - минимальное количество совпадений
 * @param {Array} selectedSkinTones - выбранные Skin Tone
 */
function findNftsWithCriteria(nfts, synergyLevel, selectedSkinTones = []) {
  console.log(`🔍 Поиск NFT с критериями:`);
  console.log(`   • Синергия: ${synergyLevel}+ совпадений`);
  console.log(`   • Skin Tone выбрано: ${selectedSkinTones.length}`);
  
  const results = [];
  
  for (const nft of nfts) {
    if (!nft.attributes || !Array.isArray(nft.attributes)) {
      continue;
    }
    
    // Проверка Skin Tone если есть выбранные
    if (selectedSkinTones.length > 0) {
      const skinToneAttr = nft.attributes.find(attr => 
        attr.trait_type === "Skin Tone" || attr.trait_type === "Skin tone"
      );
      
      if (!skinToneAttr) {
        continue; // NFT без Skin Tone
      }
      
      const hasSelectedSkinTone = selectedSkinTones.some(tone => 
        tone.name === skinToneAttr.value
      );
      
      if (!hasSelectedSkinTone) {
        continue; // Skin Tone не входит в выбранные
      }
    }
    
    // Подсчет совпадений атрибутов
    const attributeCounts = {};
    let totalMatches = 0;
    
    for (const attr of nft.attributes) {
      if (!attr.trait_type || !attr.value) continue;
      
      const key = `${attr.trait_type}:${attr.value}`.toLowerCase();
      if (attributeCounts[key]) {
        attributeCounts[key]++;
        totalMatches++;
      } else {
        attributeCounts[key] = 1;
      }
    }
    
    // Если есть достаточное количество совпадений
    if (totalMatches >= synergyLevel) {
      // Находим совпадающие атрибуты
      const matchingAttributes = [];
      for (const key in attributeCounts) {
        if (attributeCounts[key] > 1) {
          const [traitType, value] = key.split(':');
          matchingAttributes.push({
            trait_type: traitType,
            value: value,
            count: attributeCounts[key]
          });
        }
      }
      
      // Находим Skin Tone для отображения
      const skinToneAttr = nft.attributes.find(attr => 
        attr.trait_type === "Skin Tone" || attr.trait_type === "Skin tone"
      );
      
      results.push({
        nft: nft,
        synergyScore: totalMatches,
        skinTone: skinToneAttr ? skinToneAttr.value : "Не указан",
        matchingAttributes: matchingAttributes,
        uniqueAttributes: nft.attributes.length - matchingAttributes.length,
        totalAttributes: nft.attributes.length
      });
    }
  }
  
  // Сортируем по количеству совпадений (по убыванию)
  results.sort((a, b) => b.synergyScore - a.synergyScore);
  
  console.log(`✅ Найдено ${results.length} NFT, соответствующих критериям`);
  return results;
}

/**
 * Создает сообщение с результатами
 */
function createResultsMessage(results, synergyLevel, selectedSkinTones, totalNfts) {
  const selectedCount = selectedSkinTones.length;
  
  let message = "🎯 *Результаты сортировки по синергии*\n\n";
  
  message += "📋 *Параметры поиска:*\n";
  message += `• Минимальные совпадения: ${synergyLevel}+\n`;
  message += `• Skin Tone: ${selectedCount > 0 ? selectedCount + ' выбрано' : 'Все'}\n`;
  message += `• Найдено NFT: ${results.length} из ${totalNfts}\n\n`;
  
  if (results.length === 0) {
    message += "❌ *NFT не найдены*\n\n";
    message += "💡 *Возможные причины:*\n";
    message += "• В базе нет NFT с такими параметрами\n";
    message += "• Слишком высокий уровень синергии\n";
    message += "• Очень специфичные Skin Tone\n";
    message += "• Попробуйте изменить критерии поиска\n";
    
    return message;
  }
  
  // Показываем топ-10 результатов
  const topResults = results.slice(0, 10);
  
  message += "🏆 *Топ NFT по синергии:*\n\n";
  
  for (let i = 0; i < topResults.length; i++) {
    const result = topResults[i];
    const nft = result.nft;
    const nftName = nft.name || `NFT #${nft.nft_index || i+1}`;
    const escapedName = escapeMarkdown(nftName);
    
    message += `${i+1}. *${truncateText(escapedName, 30)}*\n`;
    message += `   🎯 Синергия: ${result.synergyScore} совпадений\n`;
    message += `   🎨 Skin Tone: ${result.skinTone}\n`;
    message += `   🏷️ Атрибутов: ${result.totalAttributes} (${result.uniqueAttributes} уникальных)\n`;
    
    // Показываем топ-2 совпадения
    if (result.matchingAttributes.length > 0) {
      const topMatches = result.matchingAttributes.slice(0, 2);
      message += `   🔄 Совпадения: `;
      
      for (const match of topMatches) {
        message += `${match.trait_type}:${match.value}(${match.count}x) `;
      }
      message += "\n";
    }
    
    if (nft.nft_index !== undefined) {
      message += `   📍 Индекс: ${nft.nft_index}\n`;
    }
    
    message += "\n";
  }
  
  if (results.length > 10) {
    message += `📈 ... и еще ${results.length - 10} NFT\n\n`;
  }
  
  // Статистика по Skin Tone
  const skinToneStats = {};
  results.forEach(result => {
    skinToneStats[result.skinTone] = (skinToneStats[result.skinTone] || 0) + 1;
  });
  
  const topSkinTones = Object.entries(skinToneStats)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3);
  
  if (topSkinTones.length > 0) {
    message += "📊 *Статистика по Skin Tone:*\n";
    topSkinTones.forEach(([tone, count], index) => {
      message += `${index+1}. ${tone}: ${count} NFT\n`;
    });
    message += "\n";
  }
  
  message += "💡 *Следующие шаги:*\n";
  message += "• Нажмите на номер NFT для деталей\n";
  message += "• Экспортируйте результаты в файл\n";
  message += "• Измените параметры для нового поиска\n";
  
  return message;
}

/**
 * Создает клавиатуру для результатов
 */
function createResultsKeyboard(results, synergyLevel, selectedSkinTones) {
  const inlineKeyboard = [];
  
  // Кнопки для детального просмотра первых 5 NFT
  for (let i = 0; i < Math.min(5, results.length); i++) {
    const nft = results[i].nft;
    const nftName = nft.name || `NFT #${nft.nft_index || i+1}`;
    const buttonText = `🔍 ${i+1}. ${truncateText(nftName, 15)}`;
    
    inlineKeyboard.push([{
      text: buttonText,
      callback_data: `result_detail_${i}_${synergyLevel}`
    }]);
  }
  
  // Кнопки действий
  inlineKeyboard.push([
    {
      text: "📁 Экспорт результатов",
      callback_data: "result_export"
    },
    {
      text: "🔄 Новый поиск",
      callback_data: "synergy_new_search"
    }
  ]);
  
  // Кнопка возврата к выбору параметров
  inlineKeyboard.push([{
    text: "⚙️ Изменить параметры",
    callback_data: "synergy_change_params"
  }]);
  
  return inlineKeyboard;
}

// ====== ОСНОВНЫЕ ОБРАБОТЧИКИ ======

/**
 * Обработчик команды /synergy_sort
 */
async function handleSynergySort(bot, msg) {
  const chatId = msg.chat.id;
  const messageId = msg.message_id;
  
  try {
    console.log(`🎯 Команда /synergy_sort от ${chatId}`);
    
    // Загружаем данные Skin Tone
    const skinTones = await loadAttributesPowerData();
    
    // Загружаем состояние
    const state = await loadSynergyState();
    
    // Создаем сообщение с интерфейсом выбора
    const message = createSelectionMessage(state.synergyLevel, skinTones);
    const keyboard = createSelectionKeyboard(state.synergyLevel, skinTones, 0);
    
    await bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: keyboard
      }
    });
    
    console.log(`✅ Интерфейс сортировки отправлен в чат ${chatId}`);
    
  } catch (error) {
    console.error('❌ Ошибка в handleSynergySort:', error);
    await bot.sendMessage(chatId, 
      `❌ Ошибка при создании интерфейса сортировки:\n${error.message}`
    );
  }
}

/**
 * Обработчик callback-запросов для интерфейса сортировки
 */
async function handleSynergyCallback(bot, callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const data = callbackQuery.data;
  
  console.log(`📞 Synergy callback: ${data}`);
  
  try {
    // Загружаем текущие данные
    const skinTones = await loadAttributesPowerData();
    let state = await loadSynergyState();
    let currentPage = 0;
    
    // Парсим данные для определения действия
    if (data.startsWith('synergy_select_')) {
      // Выбор уровня синергии
      const level = parseInt(data.split('_')[2]);
      if ([2, 3].includes(level)) {
        state.synergyLevel = level;
        await saveSynergyState(state);
      }
      
    } else if (data.startsWith('skin_toggle_')) {
      // Переключение выбора Skin Tone
      const parts = data.split('_');
      const skinName = parts[2];
      currentPage = parseInt(parts[3]) || 0;
      
      const toneIndex = skinTones.findIndex(t => t.name === skinName);
      if (toneIndex !== -1) {
        skinTones[toneIndex].selected = !skinTones[toneIndex].selected;
      }
      
    } else if (data.startsWith('skin_page_')) {
      // Переход на страницу Skin Tone
      currentPage = parseInt(data.split('_')[2]) || 0;
      
    } else if (data.startsWith('skin_select_all_')) {
      // Выбрать все Skin Tone на текущей странице
      currentPage = parseInt(data.split('_')[3]) || 0;
      const startIndex = currentPage * 8;
      const endIndex = startIndex + 8;
      
      for (let i = startIndex; i < endIndex && i < skinTones.length; i++) {
        skinTones[i].selected = true;
      }
      
    } else if (data.startsWith('skin_clear_all_')) {
      // Очистить все Skin Tone на текущей странице
      currentPage = parseInt(data.split('_')[3]) || 0;
      const startIndex = currentPage * 8;
      const endIndex = startIndex + 8;
      
      for (let i = startIndex; i < endIndex && i < skinTones.length; i++) {
        skinTones[i].selected = false;
      }
      
    } else if (data === 'synergy_sort_execute') {
      // Выполнение сортировки
      await executeSynergySort(bot, callbackQuery, skinTones, state);
      return; // Не обновляем интерфейс
      
    } else if (data === 'synergy_new_search' || data === 'synergy_change_params') {
      // Возврат к выбору параметров
      currentPage = 0;
      
    } else if (data === 'synergy_stats') {
      // Показ статистики
      await showSynergyStats(bot, callbackQuery);
      return;
      
    } else {
      // Неизвестная команда
      await bot.answerCallbackQuery(callbackQuery.id, { text: 'Неизвестная команда' });
      return;
    }
    
    // Обновляем интерфейс
    const selectedSkinTones = skinTones.filter(t => t.selected);
    state.selectedSkinTones = selectedSkinTones.map(t => t.name);
    await saveSynergyState(state);
    
    const message = createSelectionMessage(state.synergyLevel, skinTones, currentPage);
    const keyboard = createSelectionKeyboard(state.synergyLevel, skinTones, currentPage);
    
    await bot.editMessageText(message, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: keyboard
      }
    });
    
    await bot.answerCallbackQuery(callbackQuery.id);
    
  } catch (error) {
    console.error('❌ Ошибка в handleSynergyCallback:', error);
    await bot.answerCallbackQuery(callbackQuery.id, { text: 'Ошибка при обработке' });
  }
}

/**
 * Выполнение сортировки
 */
async function executeSynergySort(bot, callbackQuery, skinTones, state) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  
  try {
    // Показываем сообщение о начале поиска
    await bot.editMessageText(
      `🔍 *Выполняю сортировку...*\n\n` +
      `⏳ Загружаю данные NFT...`,
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown'
      }
    );
    
    await bot.answerCallbackQuery(callbackQuery.id, { text: 'Начинаю поиск...' });
    
    // Загружаем данные NFT
    const nfts = await loadNftData();
    
    if (nfts.length === 0) {
      await bot.editMessageText(
        `❌ *База данных NFT пуста*\n\n` +
        `Сначала соберите данные с помощью:\n` +
        `/get_nfts_info или /getnftsinfo\n\n` +
        `💡 После сбора данных повторите сортировку.`,
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown'
        }
      );
      return;
    }
    
    // Получаем выбранные Skin Tone
    const selectedSkinTones = skinTones.filter(t => t.selected);
    const selectedNames = selectedSkinTones.map(t => t.name);
    
    await bot.editMessageText(
      `🔍 *Выполняю сортировку...*\n\n` +
      `✅ Загружено ${nfts.length} NFT\n` +
      `🎯 Параметры:\n` +
      `• Синергия: ${state.synergyLevel}+ совпадений\n` +
      `• Skin Tone: ${selectedNames.length > 0 ? selectedNames.length + ' выбрано' : 'Все'}\n` +
      `⏳ Ищу совпадения...`,
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown'
      }
    );
    
    // Выполняем поиск
    const results = findNftsWithCriteria(
      nfts, 
      state.synergyLevel, 
      selectedNames.length > 0 ? selectedSkinTones : []
    );
    
    // Сохраняем время поиска
    state.lastSearch = new Date().toISOString();
    state.lastResultsCount = results.length;
    await saveSynergyState(state);
    
    // Создаем сообщение с результатами
    const resultsMessage = createResultsMessage(
      results, 
      state.synergyLevel, 
      selectedNames, 
      nfts.length
    );
    
    const resultsKeyboard = createResultsKeyboard(
      results, 
      state.synergyLevel, 
      selectedNames
    );
    
    await bot.editMessageText(resultsMessage, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: resultsKeyboard
      }
    });
    
  } catch (error) {
    console.error('❌ Ошибка в executeSynergySort:', error);
    
    await bot.editMessageText(
      `❌ *Ошибка при сортировке*\n\n` +
      `🔧 Детали:\n${error.message}\n\n` +
      `💡 Проверьте данные и попробуйте снова.`,
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown'
      }
    );
  }
}

/**
 * Показ статистики
 */
async function showSynergyStats(bot, callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  
  try {
    const nfts = await loadNftData();
    const skinTones = await loadAttributesPowerData();
    const state = await loadSynergyState();
    
    const selectedSkinTones = skinTones.filter(t => t.selected);
    const selectedCount = selectedSkinTones.length;
    
    let statsMessage = "📊 *Статистика сортировки*\n\n";
    
    statsMessage += "🎯 *Текущие настройки:*\n";
    statsMessage += `• Уровень синергии: ${state.synergyLevel}+\n`;
    statsMessage += `• Выбрано Skin Tone: ${selectedCount}\n`;
    
    if (selectedCount > 0) {
      const names = selectedSkinTones.map(t => t.name).slice(0, 3);
      statsMessage += `• Первые выбранные: ${names.join(", ")}\n`;
      if (selectedCount > 3) {
        statsMessage += `  ... и еще ${selectedCount - 3}\n`;
      }
    }
    
    statsMessage += `\n📁 *Данные:*\n`;
    statsMessage += `• Всего NFT в базе: ${nfts.length}\n`;
    statsMessage += `• Вариантов Skin Tone: ${skinTones.length}\n`;
    
    // Подсчет NFT по Skin Tone
    const skinToneCounts = {};
    nfts.forEach(nft => {
      if (nft.attributes) {
        const skinAttr = nft.attributes.find(attr => 
          attr.trait_type === "Skin Tone" || attr.trait_type === "Skin tone"
        );
        if (skinAttr) {
          skinToneCounts[skinAttr.value] = (skinToneCounts[skinAttr.value] || 0) + 1;
        }
      }
    });
    
    statsMessage += `• NFT с Skin Tone: ${Object.keys(skinToneCounts).length}\n`;
    
    // Самые популярные Skin Tone
    const popularSkinTones = Object.entries(skinToneCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3);
    
    if (popularSkinTones.length > 0) {
      statsMessage += `\n🏆 *Популярные Skin Tone:*\n`;
      popularSkinTones.forEach(([tone, count], index) => {
        statsMessage += `${index+1}. ${tone}: ${count} NFT\n`;
      });
    }
    
    if (state.lastSearch) {
      const lastSearchDate = new Date(state.lastSearch).toLocaleString('ru-RU');
      statsMessage += `\n⏰ *Последний поиск:*\n`;
      statsMessage += `• Дата: ${lastSearchDate}\n`;
      statsMessage += `• Найдено: ${state.lastResultsCount || 0} NFT\n`;
    }
    
    statsMessage += `\n💡 *Рекомендации:*\n`;
    statsMessage += `• Для поиска редких комбинаций используйте 3+ совпадения\n`;
    statsMessage += `• Для общего анализа используйте 2+ совпадения\n`;
    statsMessage += `• Выбирайте конкретные Skin Tone для точного поиска\n`;
    
    await bot.editMessageText(statsMessage, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: "🔄 Вернуться", callback_data: "synergy_back_to_select" }
        ]]
      }
    });
    
    await bot.answerCallbackQuery(callbackQuery.id);
    
  } catch (error) {
    console.error('❌ Ошибка в showSynergyStats:', error);
    await bot.answerCallbackQuery(callbackQuery.id, { text: 'Ошибка при получении статистики' });
  }
}

// ====== ЭКСПОРТ ======
module.exports = {
  handleSynergySort,
  handleSynergyCallback,
  
  // Экспортируем для тестирования
  loadAttributesPowerData,
  createSelectionKeyboard,
  findNftsWithCriteria
};
