const { 
  makeTonCenterRequest, 
  COLLECTION_ADDRESS_UF,
  MAIN_DATA_FILE,
  TEMP_DATA_FILE,
  ensureDataDir,
  createBackup,
  sleep
} = require('./utils.js');
const fs = require('fs').promises;
const path = require('path');

// Константы для этой команды
const LIMIT_TONCENTER = 100; // Получаем 10 NFT за раз

async function fetchNftInfoDetailed() {
  try {
    console.log('🔄 Начинаю сбор информации о NFT...');
    
    // 1. Первый запрос - получаем список NFT
    const url1 = `https://toncenter.com/api/v3/nft/items?collection_address=${COLLECTION_ADDRESS_UF}&limit=${LIMIT_TONCENTER}`;
    console.log('📡 Запрос 1 (nft/items):', url1);
    
    const data1 = await makeTonCenterRequest(url1);
    const nftItems = data1.nft_items || data1 || [];
    
    if (!nftItems || nftItems.length === 0) {
      return { error: 'NFT не найдены' };
    }
    
    console.log(`✅ Получено NFT: ${nftItems.length}`);
    
    const results = [];
    
    // Обрабатываем каждый NFT
    for (let i = 0; i < nftItems.length; i++) {
      const nft = nftItems[i];
      const nftAddress = nft.address;
      const ownerAddress = nft.owner_address || '';
      
      console.log(`\n🔍 Обработка NFT ${i + 1}/${nftItems.length}: ${nftAddress.substring(0, 20)}...`);
      
      // 2. Запрос - получаем user_friendly адрес NFT
      const url2 = `https://toncenter.com/api/v3/addressBook?address=${encodeURIComponent(nftAddress)}`;
      
      let nftUserFriendly = nftAddress; // Значение по умолчанию
      try {
        const data2 = await makeTonCenterRequest(url2);
        
        // Исправляем парсинг ответа
        if (data2 && data2[nftAddress]) {
          nftUserFriendly = data2[nftAddress].user_friendly || nftAddress;
        } else if (data2 && data2.user_friendly) {
          // Альтернативный формат ответа
          nftUserFriendly = data2.user_friendly;
        }
        
        console.log(`📝 User-friendly адрес NFT: ${nftUserFriendly}`);
        
      } catch (err2) {
        console.log(`⚠️ Ошибка запроса addressBook для NFT ${i + 1}:`, err2.message);
      }
      
      // 3. Запрос - получаем метаданные
      const url3 = `https://toncenter.com/api/v3/metadata?address=${encodeURIComponent(nftAddress)}`;
      
      let tokenName = 'Не указано';
      let nftIndex = 'Не указано';
      let imageUrl = '';
      let attributes = [];
      
      try {
        const data3 = await makeTonCenterRequest(url3);
        
        if (data3 && data3[nftAddress]) {
          const tokenData = data3[nftAddress];
          
          if (tokenData.token_info && tokenData.token_info.length > 0) {
            const tokenInfo = tokenData.token_info[0];
            
            tokenName = tokenInfo.name || 'Не указано';
            nftIndex = tokenInfo.nft_index || 'Не указано';
            
            if (tokenInfo.extra) {
              imageUrl = tokenInfo.extra._image_medium || tokenInfo.extra._image_small || '';
              attributes = tokenInfo.extra.attributes || [];
            }
          }
        }
        
        console.log(`✅ NFT ${i + 1}: ${tokenName}, атрибутов: ${attributes.length}`);
        
      } catch (err3) {
        console.log(`⚠️ Ошибка метаданных для NFT ${i + 1}:`, err3.message);
        if (err3.response?.status === 429) {
          console.log('⏳ Достигнут лимит запросов, делаю паузу...');
          await sleep(1000); // Пауза 1 секунда при 429
        }
      }
      
      // Формируем результат для этого NFT (без поля index)
      results.push({
        success: true,
        data: {
          address: nftAddress,
          owner_address: ownerAddress,
          last_transaction_lt: nft.last_transaction_lt,
          on_sale: nft.on_sale,
          nft_user_friendly: nftUserFriendly,
          name: tokenName,
          nft_index: nftIndex,
          image_url: imageUrl,
          attributes: attributes,
          getgems_url: `https://getgems.io/collection/${COLLECTION_ADDRESS_UF}/${nftUserFriendly}`,
          owner_url: `https://getgems.io/user/${ownerAddress}`
        }
      });
      
      // Пауза между обработкой NFT чтобы не превысить лимиты API
      if (i < nftItems.length - 1) {
        await sleep(500); // 500ms пауза между NFT
      }
    }
    
    console.log(`✅ Обработка завершена, собрано данных: ${results.length}`);
    
    return {
      success: true,
      results: results,
      total: results.length
    };
    
  } catch (error) {
    console.error('❌ Общая ошибка при сборе информации:', error.message);
    return { 
      error: `Ошибка API: ${error.message}` 
    };
  }
}

async function saveNftInfoToFile(nftDataArray) {
  try {
    // Убеждаемся что папка существует
    await ensureDataDir();
    
    // Читаем существующие данные из основного файла
    let allData = [];
    try {
      const fileContent = await fs.readFile(MAIN_DATA_FILE, 'utf8');
      allData = JSON.parse(fileContent);
      if (!Array.isArray(allData)) {
        allData = [];
      }
    } catch (err) {
      allData = [];
    }
    
    const stats = {
      new: 0,
      updated: 0,
      skipped: 0,
      errors: 0
    };
    
    // Обрабатываем каждый NFT
    for (const nftResult of nftDataArray) {
      if (!nftResult.success) {
        stats.errors++;
        continue;
      }
      
      const nftData = nftResult.data;
      
      // Создаем запись с timestamp
      const entry = {
        timestamp: new Date().toISOString(),
        ...nftData
      };
      
      // ПРОВЕРКА НА ДУБЛИКАТ ПО АДРЕСУ NFT
      const existingNftIndex = allData.findIndex(item => item.address === nftData.address);
      
      if (existingNftIndex !== -1) {
        // NFT уже существует в базе
        const existingNft = allData[existingNftIndex];
        
        // Проверяем, изменились ли данные
        let dataChanged = false;
        const importantFields = ['name', 'nft_index', 'owner_address', 'on_sale', 'nft_user_friendly'];
        
        for (const field of importantFields) {
          if (existingNft[field] !== nftData[field]) {
            dataChanged = true;
            console.log(`🔄 Изменение поля ${field}: "${existingNft[field]}" -> "${nftData[field]}"`);
          }
        }
        
        // Проверяем атрибуты
        const existingAttrsStr = JSON.stringify(existingNft.attributes);
        const newAttrsStr = JSON.stringify(nftData.attributes);
        if (existingAttrsStr !== newAttrsStr) {
          dataChanged = true;
          console.log(`🔄 Изменились атрибуты`);
        }
        
        if (dataChanged) {
          // Данные изменились - обновляем запись
          if (!existingNft.updateHistory) {
            existingNft.updateHistory = [];
          }
          
          existingNft.updateHistory.push({
            timestamp: existingNft.timestamp,
          });
          
          // Обновляем данные
          allData[existingNftIndex] = {
            ...entry,
            updateHistory: existingNft.updateHistory,
            firstSeen: existingNft.firstSeen || existingNft.timestamp
          };
          
          stats.updated++;
          console.log(`🔄 Обновлен NFT: ${nftData.address.substring(0, 20)}...`);
        } else {
          // Данные не изменились - пропускаем
          stats.skipped++;
          console.log(`⏭️  Пропущен (дубликат): ${nftData.address.substring(0, 20)}...`);
        }
        
      } else {
        // Это новый NFT - добавляем его
        entry.firstSeen = entry.timestamp;
        allData.push(entry);
        stats.new++;
        console.log(`✅ Новый NFT: ${nftData.address.substring(0, 20)}...`);
      }
    }
    
    // Создаем backup перед сохранением
    await createBackup();
    
    // Сохраняем обратно в основной файл
    await fs.writeFile(MAIN_DATA_FILE, JSON.stringify(allData, null, 2), 'utf8');
    
    // Сохраняем временный файл с результатами
    const tempData = {
      timestamp: new Date().toISOString(),
      stats: stats,
      nfts: nftDataArray.filter(r => r.success).map(r => r.data)
    };
    
    await fs.writeFile(TEMP_DATA_FILE, JSON.stringify(tempData, null, 2), 'utf8');
    
    const fileStats = await fs.stat(MAIN_DATA_FILE);
    const fileSize = (fileStats.size / 1024).toFixed(2);
    
    console.log(`\n📊 Итоги обработки:`);
    console.log(`   Новых: ${stats.new}`);
    console.log(`   Обновлено: ${stats.updated}`);
    console.log(`   Пропущено: ${stats.skipped}`);
    console.log(`   Ошибок: ${stats.errors}`);
    console.log(`   Всего уникальных NFT в базе: ${allData.length}`);
    
    return { 
      success: true, 
      count: allData.length,
      fileSize: fileSize,
      stats: stats
    };
    
  } catch (error) {
    console.error('❌ Ошибка сохранения в файл:', error.message);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

async function handleGetNftsInfo(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || `user_${userId}`;

  try {
    // Отправляем сообщение о начале сбора данных
    await bot.sendMessage(
      chatId,
      `📡 *Начинаю сбор информации о ${LIMIT_TONCENTER} NFT...*\n\n` +
      `Для каждого NFT выполняю 3 запроса к TonCenter API:\n` +
      `1. Получение списка NFT ✅\n` +
      `2. Конвертация адреса ✅\n` +
      `3. Получение метаданных ✅\n\n` +
      `⏳ Это может занять некоторое время...`,
      { parse_mode: 'Markdown' }
    );

    // Получаем информацию о NFT
    const fetchResult = await fetchNftInfoDetailed();
    
    if (fetchResult.error) {
      return bot.sendMessage(
        chatId,
        `❌ *Ошибка при сборе данных:*\n${fetchResult.error}`,
        { parse_mode: 'Markdown' }
      );
    }

    // Сохраняем данные в файл (без информации о пользователе)
    const saveResult = await saveNftInfoToFile(fetchResult.results);
    
    if (!saveResult.success) {
      return bot.sendMessage(
        chatId,
        `❌ *Ошибка при сохранении данных:*\n${saveResult.error}`,
        { parse_mode: 'Markdown' }
      );
    }

    // Формируем сообщение об успехе
    const stats = saveResult.stats;
    const successMessage = `✅ *Сбор данных завершен!*\n\n` +
      `📊 *Статистика обработки:*\n` +
      `✅ Новых NFT: ${stats.new}\n` +
      `🔄 Обновленных: ${stats.updated}\n` +
      `⏭️  Пропущено (дубликатов): ${stats.skipped}\n` +
      `❌ Ошибок: ${stats.errors}\n\n` +
      `🗂️ *Файл данных:* \`nft_data/all_nft_info.json\`\n` +
      `📈 Всего уникальных NFT в базе: ${saveResult.count}\n` +
      `💾 Размер файла: ${saveResult.fileSize} KB\n\n` +
      `*Доступные команды:*\n` +
      `/export_info - Скачать файл с данными\n` +
      `/stats - Показать статистику\n` +
      `/clear_info - Очистить данные`;

    await bot.sendMessage(chatId, successMessage, { parse_mode: 'Markdown' });

    console.log(`✅ Сбор данных завершен для ${username}, обработано: ${fetchResult.total} NFT`);

  } catch (error) {
    console.error('❌ Ошибка в команде /get_nfts_info:', error.message);
    
    await bot.sendMessage(
      chatId,
      `❌ *Критическая ошибка:*\n${error.message}\n\nПопробуйте еще раз через минуту.`
    );
  }
}

module.exports = { handleGetNftsInfo };