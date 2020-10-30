// function to pretty print the config data so that arrays show on one line, so it's easier to visually parse the config file when hand opening it. Purely cosmetic.
function prettyPrintConfig(cfg) {
  const output = JSON.stringify(cfg, function(k, v) {
    if (v instanceof Array) {
      return JSON.stringify(v);
    }
    return v;
  }, 2).replace(/\\/g, '')
    .replace(/"\[/g, '[')
    .replace(/\]"/g, ']')
    .replace(/"\{/g, '{')
    .replace(/\}"/g, '}');
  return output;
}

// function to write config to file.
function writeConfig(cfg) {
  fs.writeFileSync(configPath, prettyPrintConfig(cfg), function(err) {
    if (err) {
      console.log('There was an error saving the config file!');
      return console.log(err);
    }
  });
}

// require the filesystem and discord.js modules
require('console-stamp')(console, { pattern: 'mm/dd/yy HH:MM:ss', label: false });
const fs = require('fs');

const configPath = './config.json';
let config = undefined;
const wait = require('util').promisify(setTimeout);

// initialize or load any configs the a new instance doesn't start with to avoid breaking
const CONFIG_FILENAMES = ['config.json', 'counting.json', 'gamelist.json', 'datalog.json', 'prunedata.json'];
CONFIG_FILENAMES.forEach(filename => {

  if (filename != 'config.json') {
    if (!fs.existsSync(filename)) {
      fs.writeFileSync(filename, '{}', function(err) {
        if (err) return console.log(err);
      });
    }
  }
  else {
    const lastArg = process.argv[process.argv.length - 1];
    if (!fs.existsSync(filename)) {
      const freshConfig = new Object();
      freshConfig.prefix = '.';
      freshConfig.authtoken = (lastArg.length == 59) ? lastArg : '';
      freshConfig.roleStaff = '';
      freshConfig.roleComrade = '';
      freshConfig.roleAirlock = '';
      freshConfig.airlockPruneDays = '';
      freshConfig.airlockPruneMessage = '';
      freshConfig.invLogToggle = false;
      freshConfig.channelInvLogs = '';
      freshConfig.countingToggle = false;
      freshConfig.countingChannelId = '';
      freshConfig.countingFailMessages = [],
      freshConfig.countingStartMessages = [],
      freshConfig.countingFailRepeatMessages = [],
      freshConfig.repeatReacts = [],
      freshConfig.knownInvites = [],
      freshConfig.eventInfoChannelId = '';
      freshConfig.pinIgnoreChannels = [];
      freshConfig.voiceTextChannelIds = [];
      freshConfig.voiceChamberDefaultSizes = new Object();
      freshConfig.voiceChamberSnapbackDelay = '';
      freshConfig.currentActivity = new Object();
      freshConfig.currentActivity.Type = '';
      freshConfig.currentActivity.Name = '';
      freshConfig.youTubeAPIKey = '';
      writeConfig(freshConfig);
      console.log('You haven\'t setup your \'config.json\' file yet. A fresh one has been generated for you!');
    }

    config = require(configPath);
    if (!config.authtoken) {
      if (lastArg.length == 59) {
        config.authtoken = lastArg;
        writeConfig(config);
      }
      else {
        console.log ('ERROR: ' +
                       '\n- You still need to enter your bot\'s discord auth key to continue!' +
                       '\n- You can do this by entering it into your \'config.json\' *or*' +
                       '\n  by passing your discord bot auth token as the final arg (just one time) when running this script next');
        process.exit(1);
      }
    }
  }
});

const Discord = require('discord.js');
const myIntents = new Discord.Intents();

const Counting = require('./counting.js');
const vccheck = require('./commands/vccheck.js');
const listPath = './gamelist.json';
const gameList = require(listPath);
const dataLogger = require('./datalog.js');
const fetch = require('node-fetch');
const eventDataPath = './events.json';
if (fs.existsSync(eventDataPath)) { global.eventData = require(eventDataPath);}
const moment = require('moment-timezone');
const vettingLimitPath = './commands/vettinglimit.js';

Discord.Structures.extend('Guild', Guild => {
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
});

// initialize client, commands, command cooldown collections
myIntents.add(Discord.Intents.NON_PRIVILEGED,'GUILD_MEMBERS');
const client = new Discord.Client({ ws: { intents: myIntents } });
client.commands = new Discord.Collection();
const cooldowns = new Discord.Collection();
client.eventHandlers = [];

// read command files (maybe rename? plugins, features?)
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  // set a new item in the Collection
  // with the name attribute as the command name and the value as the exported module
  if (command.name) {
    client.commands.set(command.name, command);
  }
  if (command.HandleEvent) {
    client.eventHandlers.push(command);
  }
  if (command.init) {
    command.init(client);
  }
}

// initialize raw events to listen for
const events = {
  // reaction events
  MESSAGE_REACTION_ADD: 'messageReactionAdd',
  RESUMED: 'Resumed',
};

// initialize invite cache
const invites = {};

// since the datalogger takes some time to cache messages, especially on larger servers, create a global check digit to block unwanted processing of new messages during datalogging
let dataLogLock = 0;

// when the client is ready, run this code.
client.on('ready', async () => {
  console.log('Ready!');
  client.user.setActivity(config.currentActivity.Name, { type: config.currentActivity.Type });
  Counting.OnReady(config, client);
  vccheck.OnReady(client);
  // Lock datalog while caching offline messages. When that finishes, the callback will unlock the log.
  dataLogLock = 1;
  console.log('Fetching offline messages...');
  dataLogger.OnReady(config, client, function() {
    dataLogLock = 0;
    console.log('Offline message fetch complete!');
  });
  // wait 1000ms without holding up the rest of the script. This way we can ensure recieving all guild invite info.
  await wait(1000);
  client.guilds.cache.forEach(g => {
    g.fetchInvites().then(guildInvites => {
      invites[g.id] = guildInvites;
    });
  });
});

// set up listener to revert configured game chambers to their default sizes
client.on('voiceStateUpdate', (oldState, newState) => {
  if (vccheck.ChannelSnapbackCheck) {
    vccheck.ChannelSnapbackCheck (oldState, newState, client);
  }
});

// set up listener for channel creation events
client.on("channelCreate", async channel => {
  if (fs.existsSync(vettingLimitPath)) {
    vettingLimit = require(vettingLimitPath);
    if (vettingLimit.VettingLimitCheck && config.airlockChannel) {
      if (channel.name.includes(config.airlockChannel)) {
        vettingLimit.VettingLimitCheck (channel, client);
      }
    }
  }
});

// login to Discord with your app's token
client.login(config.authtoken);

// command parser
client.on('message', async message => {
  // console.log(message.author);
  // only do datalogging on non-DM text channels. Don't log messages while offline retrieval is proceeding.
  // (offline logging will loop and catch new messages on the fly.)
  if (message.channel.type === 'text' && dataLogLock != 1) { dataLogger.OnMessage(message, config); }
  if(Counting.HandleMessage(message)) {
    return;
  }
  // handler for PK user messages, so they can use bot commands.
  if (message.author.bot) {
    const pkAPIurl = 'https://api.pluralkit.me/v1/msg/' + message.id;
    let pkResponse = await fetch(pkAPIurl);
    if (pkResponse.headers.get('content-type').includes('application/json')) {
      // normally message.member isn't writeable (for good reason), so we have to change that
      Object.defineProperty(message, 'member', {
        writable: true,
      });
      pkResponse = await pkResponse.json();
      // set message author to NOT be a bot.
      message.author.bot = false;
      console.log(await message.guild.members.fetch(pkResponse.sender));
      await message.guild.members.fetch(pkResponse.sender).then(pkMbrData => message.member = pkMbrData);
      // now the message object doesn't look like a bot, and the message.member property holds data for the discord account
      // that caused the PK request to occur.
      // message.author will still contain the PK webhook username, so we'll use that for @mentions in commands when possible.
    }
  }
  // prevent parsing commands without correct prefix, from bots, and from non-staff non-comrades.
  if (!message.content.startsWith(config.prefix) || message.author.bot) return;
  if (message.channel.type == 'text' && !(message.member.roles.cache.has(config.roleStaff) || message.member.roles.cache.has(config.roleComrade))) return;

  const args = message.content.slice(config.prefix.length).split(/ +/);
  let commandName = args.shift().toLowerCase();

  // handle using help as an argument - transpose '!command help' to !help command
  if (args[0] && args[0].toLowerCase() === 'help') {
    args.length = 1;
    args[0] = commandName;
    commandName = 'help';
  }

  // checking both command names and aliases, else return from function
  const command = client.commands.get(commandName) || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));
  if (!command) return;

  // check if command is server only; prevent it from being run in DMs if so.
  if (command.guildOnly && message.channel.type !== 'text') { return await message.reply('I can\'t execute that command inside DMs!'); }

  // check permission level of command. Prevent staffonly commands from being run by non-staff.
  if (command.staffOnly && !message.member.roles.cache.has(config.roleStaff)) return;

  // check if command requires arguments
  if (command.args && !args.length) {
    let reply = 'You didn\'t provide any arguments!';
    if (command.usage) {
      reply += `\nThe proper usage would be: \`${config.prefix}${command.name} ${command.usage}\``;
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
    await command.execute(message, args, client, config);
  }
  catch (error) {
    console.error(error);
    await message.reply('there was an error trying to execute that command!');
  }

});


// Raw packet listener. This listens to all actions in discord then emits specialized events for the bot to work with.
client.on('raw', async packet => {
  // ensure the 't' field matches one of the raw events that we are listening for.
  if (!events.hasOwnProperty(packet.t)) return;
  // check if it is a reconnect packet and emit reconnection event.
  if (packet.t === 'RESUMED') {
    client.emit(events[packet.t]);
    return;
  }

  // Forward the event to any command that handles events
  client.eventHandlers.forEach(handler => handler.HandleEvent(client, config, packet));
});

// whenever client completes session resume, run this code.
client.on('Resumed', async () => {
  // Lock datalog while caching offline messages. When that finishes, the callback will unlock the log.
  dataLogLock = 1;
  dataLogger.OnReady(config, client, function() {
    dataLogLock = 0;
  });
  await wait(1000);
  // update invite cache from server.
  client.guilds.cache.forEach(g => {
    g.fetchInvites().then(guildInvites => {
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

client.on('guildMemberAdd', member => {
  if (config.invLogToggle) {
    const logChannel = client.channels.cache.get(config.channelInvLogs);
    // load the current invite list.
    member.guild.fetchInvites().then(guildInvites => {
    const pfp = member.user.displayAvatarURL();
    const creationDate = (moment(member.user.createdAt)).tz('America/Los_Angeles').format('MMM Do YYYY, h:mma z');
    const msgEmbed = new Discord.MessageEmbed()
	.setColor('#228B22')
	.setAuthor(`${member.user.tag} (${member.id})`, pfp, pfp)
	.setThumbnail(pfp)
	.setTimestamp()
	.setFooter(`Joined`, member.guild.iconURL());
      try {
        const knownInvites = new Map(config.knownInvites);
        let invite = new Discord.Collection();
        // This is the *existing* invites for the guild.
        const ei = invites[member.guild.id];
        // Update the cached invites for the guild.
        invites[member.guild.id] = guildInvites;
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
        // A real basic message with the information we need.
        

        msgEmbed.setDescription(`Created: ${creationDate}\nInvite: **${invite.code}** ${knownInvString ? `(${knownInvString})` : `\nInvited by: ${inviter} (${inviter.tag})`}\nUses: **${invite.uses}**`);
//        logChannel.send(`${member} (${member.user.tag} / ${member.id}) joined using invite code **${invite.code}** ${knownInvString ? `(${knownInvString})` : `from ${inviter} (${inviter.tag})`}. This invite has been used **${invite.uses}** times since its creation.`);
      }
      catch {
	msgEmbed.setDescription(`Created: ${creationDate}\nInvite: No info available`)
//        logChannel.send(`${member} (${member.user.tag} / ${member.id}) joined the server, but no invite information was available.`);
      }
      logChannel.send({ content: ":inbox_tray: <@" + member.id + "> joined!", embed: msgEmbed});
    });
  }
});

client.on('guildMemberRemove', member => {
  const canLog = (config.invLogToggle && Boolean(config.channelInvLogs));
  const logChannel = client.channels.cache.get(config.channelInvLogs);
  const data = [];
  if (canLog) { logChannel.send(`📤 ${member} (${member.user.tag} / ${member.id}) left :<`); }
  let exitConLog = `${member.user.tag} exited.`;
  Object.keys(gameList).forEach(sysname => {
    if (!gameList[sysname].accounts[0]) return;
    const accountInfo = gameList[sysname].accounts.filter(info => info.userID === member.id);
    if (accountInfo[0]) {
      const accountIndex = gameList[sysname].accounts.findIndex(info => info.userID === member.id);
      gameList[sysname].accounts.splice(accountIndex, 1);
      data.push(sysname);
    }
  });
  if (data.length > 0) {exitConLog += ` removing from the following game rosters: ${data.join(', ')}.`;}
  fs.writeFile(listPath, JSON.stringify(gameList, null, 2), function(err) {
    if (err) {
      if (canLog) { logChannel.send('There was an error updating games list information for exited user!'); }
      return console.log(err);
    }
  });
  if(global.eventData.userTimeZones[member.id]) {
    delete global.eventData.userTimeZones[member.id];
    fs.writeFile(eventDataPath, JSON.stringify(global.eventData, null, 2, function(err) {
      if (err) {
        if (canLog) { logChannel.send('There was an error removing exited user from events.json!');}
        return console.log(err);
      }
    }));
    exitConLog += ' Removed userdata from events.json.';
  }
  console.log(exitConLog);
});

process.on('unhandledRejection', error => console.error('Uncaught Promise Rejection! Error details:\n', error));
