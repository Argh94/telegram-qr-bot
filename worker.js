export default {
  async fetch(request, env) {
    console.log('Request received:', {
      method: request.method,
      url: request.url,
    });

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      if (request.method === 'POST') {
        const reqBody = await request.json();
        console.log('Request body:', JSON.stringify(reqBody, null, 2));

        if (!env.TELEGRAM_TOKEN) {
          throw new Error('TELEGRAM_TOKEN environment variable is not set');
        }

        const chatId = reqBody.message?.chat?.id;
        if (!chatId) {
          throw new Error('Chat ID not found in request');
        }

        let botResponses = [];

        if (reqBody.message.text === '/start') {
          console.log('Processing /start command');
          botResponses.push({
            type: 'text',
            content: escapeMarkdown(
              '🎉 *به ربات QR کد خوش اومدی!* 🤖\n\n' +
              'من می‌تونم:\n' +
              '1️⃣ متن یا لینکتو به QR کد تبدیل کنم.\n' +
              '2️⃣ محتوای QR کد رو از عکست بخونم.\n\n' +
              'فقط کافیه یه متن، لینک یا عکس QR کد برام بفرستی! 😊\n\n' +
              '------------------------------\n\n' +
              '🎉 *Welcome to QR Code Bot!* 🤖\n\n' +
              'I can:\n' +
              '1️⃣ Convert your text or link to a QR code.\n' +
              '2️⃣ Read QR code content from your image.\n\n' +
              'Just send me a text, link, or QR code image! 😊'
            ),
          });
        } else if (reqBody.message.photo) {
          console.log('Processing photo message');
          try {
            const fileId = reqBody.message.photo[reqBody.message.photo.length - 1].file_id;
            console.log('File ID:', fileId);
            const fileUrl = await getFileUrl(fileId, env.TELEGRAM_TOKEN);
            console.log('File URL:', fileUrl);

            // دریافت تصویر و لاگ هدرها
            const imageResponse = await fetch(fileUrl);
            const contentType = imageResponse.headers.get('Content-Type') || 'unknown';
            const contentLength = imageResponse.headers.get('Content-Length') || 'unknown';
            console.log('Image headers:', { contentType, contentLength });

            // بررسی اندازه تصویر
            const imageSize = parseInt(contentLength) || 0;
            const maxSize = 10 * 1024 * 1024; // 10MB
            if (imageSize > maxSize && imageSize !== 0) {
              throw new Error('حجم تصویر بیشتر از 10 مگابایت است. لطفاً یه تصویر کوچیک‌تر بفرست.');
            }

            // بررسی فرمت تصویر
            const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
            const isValidFormat = allowedTypes.includes(contentType) || fileUrl.match(/\.(png|jpg|jpeg|webp)$/i);
            if (!isValidFormat) {
              throw new Error('فرمت تصویر باید PNG، JPEG یا WebP باشه. فرمت فعلی: ' + contentType);
            }

            const imageBlob = await imageResponse.blob();
            console.log('Image blob size:', imageBlob.size, 'bytes');
            const qrContent = await scanQRCode(imageBlob);
            console.log('QR Content:', qrContent);

            if (qrContent) {
              const escapedContent = escapeMarkdown(qrContent);
              botResponses.push({
                type: 'text',
                content: escapeMarkdown(
                  '📸 *محتوای QR کدت پیدا شد!* 🎉\n\n' +
                  'این چیزیه که توی QR کد نوشته شده:\n\n' +
                  '------------------------------\n\n' +
                  '📸 *QR Code Content Found!* 🎉\n\n' +
                  'Here’s what’s in the QR code:'
                ),
              });
              botResponses.push({
                type: 'text',
                content: `\`${escapedContent}\``,
              });
            } else {
              throw new Error('محتوای QR کد خالیه.');
            }
          } catch (error) {
            console.error('Error processing photo:', error);
            botResponses.push({
              type: 'text',
              content: escapeMarkdown(
                '❌ *اوپس! یه مشکلی پیش اومد* 😓\n\n' +
                'نتونستم محتوای QR کد رو بخونم. لطفاً این موارد رو چک کن:\n' +
                '📌 تصویرت باید توی فرمت PNG، JPEG یا WebP باشه.\n' +
                '📌 حجم تصویرت باید کمتر از 10 مگابایت باشه.\n' +
                '📌 QR کد باید کامل و واضح باشه (زیاد برش نخورده باشه، تار نباشه یا کیفیتش پایین نباشه).\n' +
                '💡 اگه عکست تاره، لطفاً یه نسخه باکیفیت‌تر بفرست.\n\n' +
                '------------------------------\n\n' +
                '❌ *Oops! Something went wrong* 😓\n\n' +
                'I couldn’t read the QR code. Please check these:\n' +
                '📌 The image must be in PNG, JPEG, or WebP format.\n' +
                '📌 The image size must be under 10MB.\n' +
                '📌 The QR code must be complete and clear (not overly cropped, blurry, or low quality).\n' +
                '💡 If the image is blurry, please send a higher-quality version.\n\n' +
                `Error: ${error.message}`
              ),
            });
          }
        } else if (reqBody.message.text && reqBody.message.text !== '/start') {
          console.log('Processing text message');
          const message = reqBody.message.text;

          if (message.trim() === '') {
            botResponses.push({
              type: 'text',
              content: escapeMarkdown(
                '❌ *یه متن یا لینک درست بفرست!* 😅\n\n' +
                'متنی که فرستادی خالیه.\n\n' +
                '------------------------------\n\n' +
                '❌ *Please send a proper text or link!* 😅\n\n' +
                'The text you sent is empty.'
              ),
            });
          } else if (message.length > 850) {
            botResponses.push({
              type: 'text',
              content: escapeMarkdown(
                '❌ *متنت خیلی طولانیه!* 📏\n\n' +
                'لطفاً متنی کوتاه‌تر از 850 کاراکتر بفرست.\n\n' +
                '------------------------------\n\n' +
                '❌ *Your text is too long!* 📏\n\n' +
                'Please send a text shorter than 850 characters.'
              ),
            });
          } else if (message.startsWith('http') && !isValidUrl(message)) {
            botResponses.push({
              type: 'text',
              content: escapeMarkdown(
                '❌ *لینک معتبر نیست!* 🔗\n\n' +
                'لطفاً یه آدرس اینترنتی درست بفرست.\n\n' +
                '------------------------------\n\n' +
                '❌ *Invalid URL!* 🔗\n\n' +
                'Please send a valid URL.'
              ),
            });
          } else {
            try {
              const QR_COLOR = '262626';
              const QR_BG_COLOR = 'D9D9D9';
              const QR_SIZE = 400;
              const QR_MARGIN = 10;
              const photoUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${QR_SIZE}x${QR_SIZE}&data=${encodeURIComponent(
                message
              )}&color=${QR_COLOR}&bgcolor=${QR_BG_COLOR}&margin=${QR_MARGIN}&format=png&qzone=2`;
              console.log('Generated QR URL:', photoUrl);

              botResponses.push({
                type: 'photo',
                content: photoUrl,
                caption: escapeMarkdown(
                  '📷 *QR کدت آماده شد!* 🎉\n\n' +
                  'این QR کد برای متن یا لینکت ساخته شد.\n\n' +
                  '------------------------------\n\n' +
                  '📷 *Your QR code is ready!* 🎉\n\n' +
                  'This QR code was created for your text or link.'
                ),
              });
            } catch (error) {
              console.error('Error generating QR code:', error);
              botResponses.push({
                type: 'text',
                content: escapeMarkdown(
                  '❌ *اوپس! مشکلی پیش اومد* 😓\n\n' +
                  'نتونستم QR کد رو بسازم. لطفاً دوباره امتحان کن یا یه متن کوتاه‌تر بفرست.\n\n' +
                  '------------------------------\n\n' +
                  '❌ *Oops! Something went wrong* 😓\n\n' +
                  'I couldn’t create the QR code. Please try again or send a shorter text.'
                ),
              });
            }
          }
        }

        console.log('Prepared responses:', JSON.stringify(botResponses, null, 2));
        if (botResponses.length > 0) {
          await sendResponsesToTelegram(botResponses, chatId, env.TELEGRAM_TOKEN);
        }

        return new Response('OK', { status: 200, headers: corsHeaders });
      }

      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
    } catch (error) {
      console.error('Error processing request:', error);
      return new Response(
        JSON.stringify({ error: error.message, stack: error.stack }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  },
};

async function sendResponsesToTelegram(botResponses, chatId, token) {
  for (const response of botResponses) {
    const telegramUrl =
      response.type === 'photo'
        ? `https://api.telegram.org/bot${token}/sendPhoto`
        : `https://api.telegram.org/bot${token}/sendMessage`;
    const payload =
      response.type === 'photo'
        ? {
            chat_id: chatId,
            photo: response.content,
            caption: response.caption,
            parse_mode: 'MarkdownV2',
          }
        : {
            chat_id: chatId,
            text: response.content,
            parse_mode: 'MarkdownV2',
          };

    try {
      console.log('Sending to Telegram:', {
        url: telegramUrl,
        type: response.type,
        chat_id: chatId,
      });
      const result = await fetch(telegramUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const responseData = await result.json();
      console.log('Telegram API response:', JSON.stringify(responseData, null, 2));
      if (!result.ok) {
        throw new Error(`Telegram API error: ${JSON.stringify(responseData)}`);
      }
    } catch (error) {
      console.error('Error sending message to Telegram:', error);
      throw error;
    }
  }
}

async function getFileUrl(fileId, token) {
  console.log('Getting file URL for fileId:', fileId);
  const response = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
  const data = await response.json();
  console.log('getFile response:', data);
  if (!data.ok) {
    throw new Error(`Telegram getFile error: ${JSON.stringify(data)}`);
  }
  const fileUrl = `https://api.telegram.org/file/bot${token}/${data.result.file_path}`;
  console.log('Generated file URL:', fileUrl);
  return fileUrl;
}

async function scanQRCode(imageBlob) {
  console.log('Scanning QR code from blob');
  const formData = new FormData();
  formData.append('file', imageBlob, 'qr.png');

  // تلاش اول: qrserver.com
  try {
    const response = await fetch('https://api.qrserver.com/v1/read-qr-code/', {
      method: 'POST',
      body: formData,
    });
    const data = await response.json();
    console.log('qrserver.com scan response:', JSON.stringify(data, null, 2));

    if (data[0]?.symbol[0]?.data) {
      return data[0].symbol[0].data;
    }
    console.log('Failed to read QR code with qrserver.com. Trying goqr.me...');
  } catch (error) {
    console.error('Error with qrserver.com:', error);
  }

  // تلاش دوم: goqr.me
  try {
    const goqrFormData = new FormData();
    goqrFormData.append('file', imageBlob, 'qr.png');
    const goqrResponse = await fetch('https://api.goqr.me/v1/read-qr-code', {
      method: 'POST',
      body: goqrFormData,
    });
    const goqrData = await goqrResponse.json();
    console.log('goqr.me scan response:', JSON.stringify(goqrData, null, 2));

    if (goqrData[0]?.symbol[0]?.data) {
      return goqrData[0].symbol[0].data;
    }
    console.log('Failed to read QR code with goqr.me. Trying zxing...');
  } catch (error) {
    console.error('Error with goqr.me:', error);
  }

  // تلاش سوم: zxing (استفاده از یک سرور عمومی)
  try {
    const zxingFormData = new FormData();
    zxingFormData.append('file', imageBlob, 'qr.png');
    const zxingResponse = await fetch('https://zxing.org/w/decode', {
      method: 'POST',
      body: zxingFormData,
    });
    const zxingData = await zxingResponse.json();
    console.log('zxing scan response:', JSON.stringify(zxingData, null, 2));

    if (zxingData?.text) {
      return zxingData.text;
    }
    throw new Error('QR code could not be read by any API');
  } catch (error) {
    console.error('Error with zxing:', error);
    throw new Error('QR code could not be read');
  }
}

function escapeMarkdown(text) {
  return text.replace(/([_*[\]()~`>#+=|{}.!-])/g, '\\$1');
}

function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}
