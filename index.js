// ============================================
// تحميل المتغيرات من ملف .env أول شي
// ============================================
require('dotenv').config();

const {
    Client,
    GatewayIntentBits,
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    PermissionsBitField
} = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');

// ============================================
// قراءة الإعدادات من ملف .env
// ============================================
const CONFIG = {
    TOKEN:      process.env.BOT_TOKEN,
    CLIENT_ID:  process.env.CLIENT_ID,
    GUILD_ID:   process.env.GUILD_ID,

    BUY_ROOM_ID:  process.env.BUY_ROOM_ID,
    POST_ROOM_ID: process.env.POST_ROOM_ID,
    LOG_ROOM_ID:  process.env.LOG_ROOM_ID,
    PROBOT_ID:    process.env.PROBOT_ID || '363255928347731989',

    BASE_PRICES: {
        everyone: parseInt(process.env.PRICE_EVERYONE) || 700000,
        here:     parseInt(process.env.PRICE_HERE)     || 600000
    },
    TAX_PERCENT: parseFloat(process.env.TAX_PERCENT) || 5
};

// ============================================
// التحقق أن كل القيم المطلوبة موجودة
// ============================================
const REQUIRED_KEYS = ['TOKEN', 'CLIENT_ID', 'GUILD_ID', 'BUY_ROOM_ID', 'POST_ROOM_ID', 'LOG_ROOM_ID'];
for (const key of REQUIRED_KEYS) {
    if (!CONFIG[key]) {
        console.error(`❌ خطأ: القيمة "${key}" غير موجودة في ملف .env`);
        process.exit(1);
    }
}

// ============================================
// الطلبات المعلقة (مؤقتة في الذاكرة)
// ============================================
const pendingOrders = new Map(); // userId -> orderData

// ============================================
// الدوال المساعدة
// ============================================

/** توليد كود تحقق عشوائي من 3 أرقام */
function generateCode() {
    return Math.floor(100 + Math.random() * 900).toString();
}

/** حساب السعر النهائي = السعر × (1 + ضريبة%) + كود مدمج بالنهاية */
function calcPrice(basePrice, code) {
    const withTax = Math.ceil(basePrice * (1 + CONFIG.TAX_PERCENT / 100));
    if (!code || isNaN(code)) return withTax;
    // مثال: 735000 + كود 476 = 735476
    return parseInt(withTax.toString() + code);
}

/** تنسيق المبلغ بفواصل لسهولة القراءة */
function formatAmount(amount) {
    return amount.toLocaleString('en-US');
}

// ============================================
// تسجيل أوامر السلاش
// ============================================
const commands = [
    new SlashCommandBuilder()
        .setName('publish_buy_panel')
        .setDescription('نشر لوحة شراء المنشورات')
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '9' }).setToken(CONFIG.TOKEN);

(async () => {
    try {
        await rest.put(
            Routes.applicationGuildCommands(CONFIG.CLIENT_ID, CONFIG.GUILD_ID),
            { body: commands }
        );
        console.log('✅ الأوامر مسجلة بنجاح');
    } catch (error) {
        console.error('❌ خطأ في تسجيل الأوامر:', error);
    }
})();

// ============================================
// تشغيل البوت
// ============================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.on('ready', () => {
    console.log(`✅ البوت شغال وجاهز: ${client.user.tag}`);
    console.log(`📋 السيرفر: ${CONFIG.GUILD_ID}`);
});

// ============================================
// معالجة التفاعلات (أزرار، مودالز، أوامر)
// ============================================
client.on('interactionCreate', async interaction => {
    try {

        // ---- أوامر السلاش ----
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === 'publish_buy_panel') {

                if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                    return interaction.reply({ content: '❌ ما عندك صلاحية استخدام هذا الأمر.', ephemeral: true });
                }

                const embed = new EmbedBuilder()
                    .setTitle('🛒 لوحة شراء المنشورات والمنشن')
                    .setColor(0x5865F2)
                    .setDescription(
                        'اضغط على الأزرار بالأسفل لشراء نشر منشورك تلقائياً.\n' +
                        'الدفع يتم عبر نظام تحويل كريدت بروبوت بالتأكيد التلقائي المطور.'
                    );

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('buy_post')
                        .setLabel('شراء نشر طلب')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('✨'),
                    new ButtonBuilder()
                        .setCustomId('show_prices')
                        .setLabel('لرؤية أسعار الطلبات')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('📡')
                );

                const buyChannel = await client.channels.fetch(CONFIG.BUY_ROOM_ID);
                if (buyChannel) {
                    await buyChannel.send({ embeds: [embed], components: [row] });
                    return interaction.reply({ content: '✅ تم نشر اللوحة في الروم المخصص بنجاح.', ephemeral: true });
                } else {
                    return interaction.reply({ content: '❌ لم يتم العثور على روم الشراء، تأكد من الآيدي في ملف .env', ephemeral: true });
                }
            }
        }

        // ---- الأزرار ----
        if (interaction.isButton()) {

            // زر عرض الأسعار
            if (interaction.customId === 'show_prices') {
                const everyoneTax = Math.ceil(CONFIG.BASE_PRICES.everyone * (1 + CONFIG.TAX_PERCENT / 100));
                const hereTax     = Math.ceil(CONFIG.BASE_PRICES.here     * (1 + CONFIG.TAX_PERCENT / 100));

                const embed = new EmbedBuilder()
                    .setTitle('💰 أسعار المنشنات شاملة الضريبة')
                    .setColor(0xffd700)
                    .addFields(
                        {
                            name: '@everyone',
                            value: `السعر الأساسي: **${formatAmount(CONFIG.BASE_PRICES.everyone)}**\nشامل الضريبة: \`${formatAmount(everyoneTax)}\` كريدت`,
                            inline: true
                        },
                        {
                            name: '@here',
                            value: `السعر الأساسي: **${formatAmount(CONFIG.BASE_PRICES.here)}**\nشامل الضريبة: \`${formatAmount(hereTax)}\` كريدت`,
                            inline: true
                        },
                        {
                            name: 'ℹ️ طريقة الدفع والتحقق التلقائي',
                            value:
                                'عند طلب النشر، سيقوم البوت بتوليد **كود مخصص من 3 أرقام** يُضاف تلقائياً لآخر المبلغ ' +
                                '(مثال: `735,412`). يجب عليك تحويل المبلغ المكتوب بالضبط بدون زيادة أو نقصان ' +
                                'ليتم تفعيل طلبك ونشره فوراً.'
                        }
                    );
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            // زر شراء منشور
            if (interaction.customId === 'buy_post') {
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('mention_everyone').setLabel('@everyone').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('mention_here').setLabel('@here').setStyle(ButtonStyle.Success)
                );
                return interaction.reply({ content: 'الرجاء اختيار نوع المنشن المطلوب لمنشورك:', components: [row], ephemeral: true });
            }

            // اختيار نوع المنشن وفتح المودال
            if (interaction.customId === 'mention_everyone' || interaction.customId === 'mention_here') {
                const mentionType = interaction.customId.includes('everyone') ? 'everyone' : 'here';
                const code        = generateCode();
                const basePrice   = CONFIG.BASE_PRICES[mentionType];
                const finalPrice  = calcPrice(basePrice, code);

                pendingOrders.set(interaction.user.id, {
                    mentionType,
                    basePrice,
                    finalPrice,
                    code,
                    step: 'content',
                    createdAt: Date.now()
                });

                const modal = new ModalBuilder()
                    .setCustomId('post_modal')
                    .setTitle('📝 محتوى منشورك الإعلاني');

                const input = new TextInputBuilder()
                    .setCustomId('content')
                    .setLabel('اكتب منشورك هنا بدقة')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setMaxLength(2000);

                modal.addComponents(new ActionRowBuilder().addComponents(input));
                return interaction.showModal(modal);
            }
        }

        // ---- المودال ----
        if (interaction.isModalSubmit() && interaction.customId === 'post_modal') {
            const content = interaction.fields.getTextInputValue('content');
            const order   = pendingOrders.get(interaction.user.id);

            if (!order) {
                return interaction.reply({
                    content: '❌ انتهت الجلسة أو تأخرت في كتابة المنشور، الرجاء المحاولة مجدداً.',
                    ephemeral: true
                });
            }

            order.content = content;
            order.step    = 'waiting_payment';

            const logChannel = await client.channels.fetch(CONFIG.LOG_ROOM_ID);
            const mentionStr = order.mentionType === 'everyone' ? '@everyone' : '@here';

            const embed = new EmbedBuilder()
                .setTitle('⏳ طلب نشر جديد - في انتظار التحويل')
                .setColor(0xffff00)
                .addFields(
                    { name: '👤 المشتري',               value: `<@${interaction.user.id}> (\`${interaction.user.id}\`)` },
                    { name: '📢 نوع المنشن',             value: mentionStr,                     inline: true },
                    { name: '🔑 كود التحقق',             value: `\`${order.code}\` (مدمج بآخر المبلغ)`, inline: true },
                    { name: '💰 المبلغ المطلوب بالضبط', value: `**\`${formatAmount(order.finalPrice)}\` كريدت**` },
                    { name: '📝 محتوى المنشور',          value: content.substring(0, 1024) }
                )
                .setFooter({ text: 'البوت يراقب التحويلات بروم اللوق تلقائياً، لا تحول مبلغاً مختلفاً.' });

            await logChannel.send({
                content:
                    `⚠️ <@${interaction.user.id}> لتمام عملية الشراء، انسخ الأمر بالأسفل وحوله في روم الأوامر لبروبوت:\n` +
                    `\`\`\`/credits transfer user:${client.user.id} amount:${order.finalPrice}\`\`\`\n` +
                    `**مهم جداً:** قم بنسخ المبلغ الموضح بالأمر تماماً ليتعرف النظام على كود التحقق الخاص بك \`${order.code}\`.`,
                embeds: [embed]
            });

            return interaction.reply({
                content:
                    `✅ **تم تسجيل طلبك بنجاح!**\n\n` +
                    `• المبلغ الإجمالي المطلوب: \`${formatAmount(order.finalPrice)}\` كريدت\n` +
                    `• كود التحقق الخاص بك: \`${order.code}\`\n\n` +
                    `توجه فوراً لروم الأوامر وقم بتحويل المبلغ المطلوب. سيقوم البوت بفحص العملية ونشر إعلانك تلقائياً خلال ثوانٍ من التحويل الصحيح.`,
                ephemeral: true
            });
        }

    } catch (err) {
        console.error('❌ Interaction Error:', err);
    }
});

// ============================================
// مراقبة رسائل بروبوت والتحقق من التحويلات
// ============================================
client.on('messageCreate', async message => {
    try {
        // تجاهل أي رسالة ليست من بروبوت أو خارج روم اللوق
        if (message.author.id !== CONFIG.PROBOT_ID) return;
        if (message.channel.id !== CONFIG.LOG_ROOM_ID) return;

        const content = message.content;

        // الـ Regex يدعم صيغ بروبوت الإنجليزية والعربية مع وبدون فواصل
        const match =
            content.match(/(?:transferred|has transferred)\s+\$?([\d,]+)\s+credits?\s+to\s+<@!?(\d+)>/i) ||
            content.match(/(?:قام\s+بتحويل)\s+\$?([\d,]+)\s+إلى\s+<@!?(\d+)>/i);

        if (!match) return;

        const amount    = parseInt(match[1].replace(/,/g, ''));
        const targetId  = match[2];

        // التحويل يجب أن يكون للبوت نفسه
        if (targetId !== client.user.id) return;

        // البحث عن الطلب المطابق للمبلغ في الطلبات المعلقة
        let matchedUserId = null;
        let matchedOrder  = null;

        for (const [userId, order] of pendingOrders.entries()) {
            if (order.step === 'waiting_payment' && order.finalPrice === amount) {
                matchedUserId = userId;
                matchedOrder  = order;
                break;
            }
        }

        if (!matchedOrder) {
            // مبلغ غير معروف أو طلب منتهي
            await message.channel.send(
                `⚠️ تم استقبال تحويل بمبلغ \`${formatAmount(amount)}\` كريدت لكن لا يوجد طلب مطابق. ` +
                `تأكد من صحة المبلغ أو راجع المشتري.`
            );
            return;
        }

        // ---- تم التحقق بنجاح، نشر المنشور ----
        pendingOrders.delete(matchedUserId);

        const postChannel = await client.channels.fetch(CONFIG.POST_ROOM_ID);
        const mentionStr  = matchedOrder.mentionType === 'everyone' ? '@everyone' : '@here';

        // نشر المنشور في الروم المخصص
        await postChannel.send({
            content: `${mentionStr}\n\n${matchedOrder.content}`,
            allowedMentions: { parse: [matchedOrder.mentionType] }
        });

        // إشعار في روم اللوق
        const successEmbed = new EmbedBuilder()
            .setTitle('✅ تم نشر المنشور بنجاح')
            .setColor(0x57f287)
            .addFields(
                { name: '👤 المشتري',    value: `<@${matchedUserId}>`,                         inline: true },
                { name: '📢 نوع المنشن', value: mentionStr,                                    inline: true },
                { name: '💰 المبلغ',     value: `\`${formatAmount(amount)}\` كريدت`,           inline: true },
                { name: '🔑 الكود',      value: `\`${matchedOrder.code}\``,                    inline: true },
                { name: '📝 المنشور',    value: matchedOrder.content.substring(0, 512) }
            )
            .setTimestamp();

        await message.channel.send({ embeds: [successEmbed] });

        // إشعار المشتري برسالة خاصة (DM)
        try {
            const buyer = await client.users.fetch(matchedUserId);
            await buyer.send(
                `✅ **تم نشر منشورك بنجاح!**\n` +
                `المبلغ المدفوع: \`${formatAmount(amount)}\` كريدت\n` +
                `نوع المنشن: ${mentionStr}\n\n` +
                `شكراً لاستخدامك الخدمة! 🎉`
            );
        } catch {
            // المستخدم أغلق الرسائل الخاصة، لا مشكلة
        }

    } catch (err) {
        console.error('❌ messageCreate Error:', err);
    }
});

// ============================================
// تشغيل البوت بالتوكن من .env
// =======================
client.login(process.env.DISCORD_TOKEN);
