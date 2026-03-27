require('dotenv').config();
const fs = require('fs');

const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  StringSelectMenuBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionsBitField,
  ChannelType,
  REST,
  Routes,
  SlashCommandBuilder
} = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ================= DATABASE =================
const DB_FILE = './data.json';
let db = { tickets: {}, settings: { staffRole: null, logChannel: null } };
if (fs.existsSync(DB_FILE)) db = JSON.parse(fs.readFileSync(DB_FILE));
function save() { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }

// ================= COMMAND =================
const commands = [
  new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Create a ticket panel')
    .addStringOption(o => o.setName('title').setDescription('Panel title').setRequired(true))
    .addStringOption(o => o.setName('description').setDescription('Panel description').setRequired(true)),

  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Setup bot')
    .addRoleOption(o => o.setName('staff').setDescription('Staff role').setRequired(true))
    .addChannelOption(o => o.setName('logs').setDescription('Log channel').setRequired(true))
];

// ================= REGISTER =================
client.once('clientReady', async () => {
  console.log(`READY: ${client.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(client.user.id, '1458308688375840901'),
    { body: commands.map(c => c.toJSON()) }
  );

  console.log('✅ Commands loaded');
});

// ================= INTERACTIONS =================
client.on('interactionCreate', async (i) => {

  if (i.isChatInputCommand()) {
    await i.deferReply();

    if (i.commandName === 'setup') {
      db.settings.staffRole = i.options.getRole('staff').id;
      db.settings.logChannel = i.options.getChannel('logs').id;
      save();

      return i.editReply('✅ Setup complete');
    }

    if (i.commandName === 'panel') {
      const title = i.options.getString('title');
      const desc = i.options.getString('description');

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(desc)
        .setColor(0x5865F2);

      const menu = new StringSelectMenuBuilder()
        .setCustomId('ticket_create')
        .setPlaceholder('Select ticket type')
        .addOptions([
          { label: 'Support', value: 'support' },
          { label: 'Billing', value: 'billing' },
          { label: 'Other', value: 'other' }
        ]);

      const row = new ActionRowBuilder().addComponents(menu);

      return i.editReply({ embeds: [embed], components: [row] });
    }
  }

  // ===== CREATE TICKET =====
  if (i.isStringSelectMenu()) {

    const guild = i.guild;

    let category = guild.channels.cache.find(c => c.name === 'tickets');
    if (!category) {
      category = await guild.channels.create({ name: 'tickets', type: ChannelType.GuildCategory });
    }

    const channel = await guild.channels.create({
      name: `ticket-${i.user.username}`,
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: i.user.id, allow: [PermissionsBitField.Flags.ViewChannel] }
      ]
    });

    db.tickets[channel.id] = { user: i.user.id };
    save();

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('close').setLabel('Close').setStyle(ButtonStyle.Danger)
    );

    const embed = new EmbedBuilder()
      .setTitle('Ticket Opened')
      .setDescription('Support will be with you shortly.')
      .setColor(0x00ff99);

    await channel.send({ content: `<@${i.user.id}>`, embeds: [embed], components: [buttons] });

    i.reply({ content: `✅ Ticket created: ${channel}`, ephemeral: true });
  }

  // ===== CLOSE =====
  if (i.isButton() && i.customId === 'close') {

    const logChannel = i.guild.channels.cache.get(db.settings.logChannel);

    if (logChannel) {
      const logEmbed = new EmbedBuilder()
        .setTitle('Ticket Closed')
        .addFields(
          { name: 'User', value: `<@${db.tickets[i.channel.id]?.user}>` },
          { name: 'Channel', value: i.channel.name }
        )
        .setColor(0xff0000)
        .setTimestamp();

      logChannel.send({ embeds: [logEmbed] });
    }

    delete db.tickets[i.channel.id];
    save();

    await i.reply('Closing ticket...');
    setTimeout(() => i.channel.delete(), 2000);
  }
});

client.login(process.env.TOKEN);
