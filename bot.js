// require the filesystem and discord.js modules
require('console-stamp')(console, { format: ':date(mm/dd/yy HH:MM:ss)' });
const fs = require('fs');
// const fsp = fs.promises; probably can be removed?
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const dbpath = ('./db/');
const Discord = require('discord.js');
const register = require('./register.js');
// const counting = require('./counting.js'); TODO fix counting


// TODO maybe - create sql db of votes so they are not listed in plaintext? is this worth the work?
const voteDataPath = './votes.json';
if (fs.existsSync(voteDataPath)) {global.voteData = require(voteDataPath);}
const moment = require('moment-timezone');
// TODO: move starboard into modules.
const starboard = require('./starboard.js');
const { getMessagePermLevel, pkQuery, getConfig, isTextChannel } = require('./extras/common.js');
const { prepTables: prepConfigTables } = require('./commands/config.js');


// initialize apitokens.json and error out if api token is missing.
if (!fs.existsSync('apitokens.json')) {
  const filedata = { discordAuthToken: '', youTubeAPIKey: '' };
  fs.writeFileSync('apitokens.json', filedata, function(err) {
    if (err) return console.log(err);
  });
}
const { discordAuthToken } = require('./apitokens.json');
if (!discordAuthToken || discordAuthToken == '') {
  console.log ('ERROR: ' +
              '\n- You still need to enter your bot\'s discord auth key to continue!' +
              '\n- You can do this by entering it into your \'config.json\' *or*' +
              '\n  by passing your discord bot auth token as the final arg (just one time) when running this script next');
  process.exit(1);
}

// preserving this as a list of old JSON stuff to be converted/removed. TODO: remove when done.
/* const CONFIG_FILENAMES = ['config.json', 'counting.json', 'gamelist.json', 'datalog.json', 'prunestorage.json']; */

// Extend guild with music details accessed by the .yt command.
// TODO: Structures removed, rework .yt command
/* Discord.Structures.extend('Guild', Guild => {
  class MusicGuild extends Guild {
    constructor(client, data) {
      super(client, data);
      this.musicData = {
        queue: [],
        isPlaying: false,
        volume: 0.2,
        songDispatcher: null,
        voiceChannel: null,
        voiceTextChannel: null,
        nowPlaying: null,
      };
    }
  }
  return MusicGuild;
}); */

// initialize client, commands, command cooldown collections
// discord "give me all intents" bitfield.
const myIntents = new Discord.Intents(32767);
const client = new Discord.Client({ intents: myIntents, partials: ['MESSAGE', 'CHANNEL', 'REACTION'] });
client.commands = new Discord.Collection();
client.slashCommands = new Discord.Collection();
const cooldowns = new Discord.Collection();

// initiate the sql db with various bot data
// then initiate commands and modules
// TODO: clear out any servers the bot has exited from when initializing DBs
let botdb;
(async () => {
  try {
    if (!fs.existsSync(dbpath)) {
      fs.mkdirSync(dbpath);
    }
    await open({
      filename: `${dbpath}botdata.db`,
      driver: sqlite3.Database,
    }).then((value) => {
      console.log('Bot data db opened.');
      botdb = value;
    });
    // prepTables preps any new config related tables.
    // cannot be used via init() as it sets up values that init processes will need.
    await prepConfigTables(client, botdb);
    const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
      const command = require(`./commands/${file}`);
      // set a new item in the Collection
      // with the name attribute as the command name and the value as the exported module
      if (command.name) {
        client.commands.set(command.name, command);
      }
      if (command.init) {
        command.init(client, botdb);
      }
    }
    const modules = fs.readdirSync('./modules').filter(file => file.endsWith('.js'));
    for (const file of modules) {
      const module = require(`./modules/${file}`);
      // if the module exports have an "execute" func, it's a command; add it to the commands collection.
      if (typeof module.execute === 'function') {
        client.commands.set(module.name, module);
      }
      if (module.init) {
        await module.init(client, botdb);
      }
    }
    // ./modules/register.js handles registering slash commands with Discord.
    // but we do need to process the .init segment, and add to the list of useable slash commands.
    const slashCommandFiles = fs.readdirSync('./slashcommands').filter(file => file.endsWith('.js'));
    for (const file of slashCommandFiles) {
      const command = require(`./slashcommands/${file}`);
      client.slashCommands.set(command.data.name, command);
      if (command.init) {
        await command.init(client, botdb);
      }
    }
  }
  catch (error) { console.error(error); }
})();

// login to Discord with your app's token
client.login(discordAuthToken);

client.on('guildCreate', async () => {
  // TODO Initialize config items on guild join.
});

// initialize invite cache
const invites = {};
const vanityInvites = {};

// when the client is ready, run this code.
client.on('ready', async () => {
  console.log('Ready!');
  register.onReady(client);
  // TODO fix activity command
  // if (config.currentActivity) { client.user.setActivity(config.currentActivity.Name, { type: config.currentActivity.Type }); }
  // client.user.setActivity('Wrestlemania', { type: 'WATCHING' });
  // counting.OnReady(config, client);
  await starboard.onReady(botdb, client);
  client.guilds.cache.forEach(g => {
    g.invites.fetch().then(guildInvites => {
      invites[g.id] = guildInvites;
    });
    if (g.vanityURLCode) {
      g.fetchVanityData().then(vanityData => {
        vanityInvites[g.id] = {
          code: vanityData.code,
          uses: vanityData.uses,
        };
      });
    }
  });
});

// set up listener for channel creation events
// client.on('channelCreate', async channel => { });

// set up listener for user update events
// TODO: move to modules
/* client.on('userUpdate', async (oldUser, newUser) => {
  if (oldUser.avatar !== newUser.avatar && config.avatarLogToggle && config.channelAvatarLogs) {
    // If the toggle to make this feature airlock-role-only is on, then check if the user has that role
    if (config.avatarLogAirlockOnlyToggle && config.roleComrade) {
      for (let g of await client.guilds.cache) {
        g = g[1];
        const member = await g.members.cache.get(newUser.id);
        if (await member.roles.cache.has(config.roleComrade)) {
          return;
        }
      }
    }
    const nullPFP = 'https://cdn.discordapp.com/embed/avatars/2.png';
    const oldPFP = `https://cdn.discordapp.com/avatars/${oldUser.id}/${oldUser.avatar}.jpg`;
    const newPFP = `https://cdn.discordapp.com/avatars/${newUser.id}/${newUser.avatar}.jpg`;
    const avatarLogChannel = client.channels.cache.get(config.channelAvatarLogs);
    const msgEmbed = new Discord.MessageEmbed()
      .setColor('#DC143C')
      .setTimestamp();
      // .setFooter('Changed PFP', client.iconURL())
    if (oldUser.avatar !== null) {
      msgEmbed.setThumbnail(oldPFP);
    }
    else {
      msgEmbed.setThumbnail(nullPFP);
    }
    if (newUser.avatar !== null) {
      msgEmbed.setAuthor(`${newUser.username}#${newUser.discriminator} (${newUser.id})`, newPFP, newPFP);
      msgEmbed.setDescription('Profile Picture Changed To:');
      msgEmbed.setImage(newPFP);
    }
    else {
      msgEmbed.setAuthor(`${newUser.username}#${newUser.discriminator} (${newUser.id})`, nullPFP, nullPFP);
      msgEmbed.setDescription('Profile Picture Removed:');
      msgEmbed.setImage(nullPFP);
    }
    avatarLogChannel.send({ content: ':exclamation: <@' + newUser.id + '> changed their profile picture:', embeds: [msgEmbed] });
  }
}); */

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;
  const command = client.slashCommands.get(interaction.commandName);
  if (!command) return;
  if (command.guildOnly && !interaction.guild) {
    return await interaction.reply({ content: 'Sorry, this command can only be run from in a server!', ephemeral: true });
  }
  try {
    await command.execute(interaction, botdb);
  }
  catch (error) {
    console.error(error);
    await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
  }
});

// command parser
client.on('messageCreate', async message => {
  // currently, there is no support for commands used in DMs.
  if (message.channel instanceof Discord.DMChannel) return;
  const config = getConfig(client, message.guild.id);
  // skip all handling for counting messages that successfully increment a count.
  // TODO fix counting
  /* if(counting.HandleMessage(message)) {
    return;
  } */
  // cache PKData for message.
  await pkQuery(message);
  const permLevel = getMessagePermLevel(message);
  // prevent parsing commands without correct prefix, from bots, and from non-staff non-users.
  if (!message.content.startsWith(config.prefix) || (message.author.bot && !message.isPKMessage)) return;
  // ensure the channel is a guild text or guild thread channel.
  if ((isTextChannel(message.channel)) && !(permLevel == 'staff' || permLevel == 'user')) return;
  const args = message.content.slice(config.prefix.length).split(/ +/);
  let commandName = args.shift().toLowerCase();

  // handle using help as an argument - transpose '!command help' to !help command
  if (args[0] && args[0].toLowerCase() === 'help' && client.commands.has(commandName)) {
    args.length = 1;
    args[0] = commandName;
    commandName = 'help';
  }

  // checking both command names and aliases, else return from function
  const command = client.commands.get(commandName) || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));
  if (!command) return;

  // check if command is server only; prevent it from being run in DMs if so.
  if (command.guildOnly && message.channel.type !== 'GUILD_TEXT') { return await message.reply('I can\'t execute that command inside DMs!'); }

  // check permission level of command. Prevent staffonly commands from being run by non-staff.
  if (command.staffOnly && permLevel != 'staff') return;

  // check if command requires arguments
  if (command.args && !args.length) {
    let reply = 'You didn\'t provide any arguments!';
    if (command.usage) {
      reply += `\nThe proper usage would be: \`${config.prefix}${command.name} ${command.usage(config)}\``;
    }
    return await message.channel.send(reply);
  }

  // Cooldowns. First, create a collection that includes all cooldowns.
  if (!cooldowns.has(command.name)) {
    cooldowns.set(command.name, new Discord.Collection());
  }
  const now = Date.now();
  const timestamps = cooldowns.get(command.name);
  const cooldownAmount = (command.cooldown || 0.1) * 1000;
  // Then, check if the user is sending the command before the cooldown is up.
  if (timestamps.has(message.author.id)) {
    const expirationTime = timestamps.get(message.author.id) + cooldownAmount;
    if (now < expirationTime) {
      const timeLeft = (expirationTime - now) / 1000;
      return await message.channel.send(`please wait ${timeLeft.toFixed(1)} more second(s) before reusing the \`${command.name}\` command.`);
    }
  }
  // Then, start the cooldown for the command.
  timestamps.set(message.author.id, now);
  setTimeout(() => timestamps.delete(message.author.id), cooldownAmount);

  // Try to execute the command and return an error if it fails.
  try {
    await command.execute(message, args, botdb);
  }
  catch (error) {
    console.error(error);
    await message.reply('there was an error trying to execute that command!');
  }

});

// update invite cache from server when invites are created/deleted
client.on('inviteCreate', async () => {
  // console.log('invite created!');
  client.guilds.cache.forEach(async g => {
    g.invites.fetch().then(guildInvites => {
      invites[g.id] = guildInvites;
    });
  });
});

// Connection error logging
client.on('shardError', err => {
  console.log('Connection Error! The error was: "' + err.message + '". Will automatically attempt to reconnect.');
});

// all other error logging
client.on('error', err => {console.error(err);});

// tracking origin of guild members when added
client.on('guildMemberAdd', async member => {
  const config = getConfig(client, member.guild.id);
  if (config.invLogToggle) {
    const pfp = member.user.displayAvatarURL();
    const creationDate = (moment(member.user.createdAt)).tz('America/Los_Angeles').format('MMM Do YYYY, h:mma z');
    const msgEmbed = new Discord.MessageEmbed()
      .setColor('#228B22')
      .setAuthor(`${member.user.tag} (${member.id})`, pfp, pfp)
      .setThumbnail(pfp)
      .setTimestamp()
      .setFooter('Joined', member.guild.iconURL());
    const logChannel = client.channels.cache.get(config.channelInvLogs);
    let usedVanityCode = false;
    // if vanity url uses has increased since last user added we can assume this new member used the vanity url.
    if (member.guild.vanityURLCode) {
      await member.guild.fetchVanityData().then(vanityData => {
        if (vanityInvites[member.guild.id] && vanityData.uses > vanityInvites[member.guild.id].uses && vanityData.uses != 0) {
          msgEmbed.setDescription(`Created: ${creationDate}\nInvite: **${member.guild.vanityURLCode}** \nUses: **${member.guild.vanityURLUses}**`);
          logChannel.send({ content: ':inbox_tray: <@' + member.id + '> joined!', embeds: [msgEmbed] });
          usedVanityCode = true;
        }
        // update vanity cache for this guild
        vanityInvites[member.guild.id] = {
          code: vanityData.code,
          uses: vanityData.uses,
        };
      });
    }
    if (!usedVanityCode) {
      // since vanityinvites weren't incremented, go ahead and load the current invite list.
      await member.guild.invites.fetch().then(guildInvites => {
        let invite = new Discord.Collection();
        const knownInvites = new Map(config.knownInvites);
        try {
        // This is the *cached* invites for the guild prior to user join.
          const ei = invites[member.guild.id];
          // Look through the invites, find the one for which the uses went up. This will find any invite that's cached.
          try { invite = guildInvites.find(i => ei.get(i.code).uses < i.uses); }
          // however, if the previous line throws an error, the invite used was not cached.
          // in this case, since invites are cached every time someone joins, the invite must be the uncached invite, that has exactly one use on it.
          catch {	invite = guildInvites.find(i => (!ei.get(i.code) && i.uses === 1));	}
          // This is just to simplify the message being sent below (inviter doesn't have a tag property)
          const inviter = client.users.cache.get(invite.inviter.id);
          let knownInvString = false;
          if (knownInvites.has(invite.code)) {
            knownInvString = knownInvites.get(invite.code);
          }
          msgEmbed.setDescription(`Created: ${creationDate}\nInvite: **${invite.code}** ${knownInvString ? `(${knownInvString})` : `\nInvite by: ${inviter} (${inviter.tag})`}\nUses: **${invite.uses}${invite.maxUses ? `/${invite.maxUses}` : ''}**`);
        // logChannel.send(`${member} (${member.user.tag} / ${member.id}) joined using invite code **${invite.code}** ${knownInvString ? `(${knownInvString})` : `from ${inviter} (${inviter.tag})`}. This invite has been used **${invite.uses}** times since its creation.`);
        }
        catch {
        // if the previous code didn't work, compare the size of the cached invites to the fresh copy of guild invites.
        // if it's decreased, we can safely assume that an invite was deleted.
          if (invites[member.guild.id].size > guildInvites.size) {
            for (const i of invites[member.guild.id]) {
            // compare cached to current and find the missing invite.
              if (!guildInvites.has(i[0])) {
                invite = i[1];
              }
            }
            const inviter = client.users.cache.get(invite.inviter.id);
            let knownInvString = false;
            if (knownInvites.has(invite.code)) {
              knownInvString = knownInvites.get(invite.code);
            }
            msgEmbed.setDescription(`Created: ${creationDate}\nInvite: **${invite.code}** ${knownInvString ? `(${knownInvString})` : `\nInvite by: ${inviter} (${inviter.tag})`}\nUses: **${invite.uses + 1}${invite.maxUses ? `/${invite.maxUses}` : ''}**\n**Last use of limited invite code**`);
          }
          else { msgEmbed.setDescription(`Created: ${creationDate}\nInvite: No info available`); }
        // logChannel.send(`${member} (${member.user.tag} / ${member.id}) joined the server, but no invite information was available.`);
        }
        // Update the cached invites for the guild.
        invites[member.guild.id] = guildInvites;
        logChannel.send({ content: ':inbox_tray: <@' + member.id + '> joined!', embeds: [msgEmbed] });
      });
    }
  }
});

client.on('guildMemberRemove', async member => {
  const config = getConfig(client, member.guild.id);
  const canLog = (config.invLogToggle && Boolean(config.channelInvLogs));
  const logChannel = client.channels.cache.get(config.channelInvLogs);
  if (canLog) { logChannel.send(`📤 ${member} (${member.user.tag} / ${member.id}) left :<`); }
  const exitConLog = `${member.user.tag} exited.`;
  // TODO: rework this segment for sql events
  /* if(global.eventData.userTimeZones[member.id]) {
    delete global.eventData.userTimeZones[member.id];
    await fsp.writeFile(eventDataPath, JSON.stringify(global.eventData, null, 2, function(err) {
      if (err) {
        if (canLog) { logChannel.send('There was an error removing exited user from events.json!');}
        return console.log(err);
      }
    }));
    exitConLog += ' Removed userdata from events.json.';
  } */
  console.log(exitConLog);
});

// joined a server
client.on('guildCreate', guild => {
  console.log('Joined a new guild: ' + guild.name);
  // Your other stuff like adding to guildArray
});

// removed from a server
client.on('guildDelete', guild => {
  console.log('Left a guild: ' + guild.name);
  // remove from guildArray
});

process.on('unhandledRejection', error => console.error('Uncaught Promise Rejection! Error details:\n', error));
