// require the filesystem and discord.js modules, and pull data from config.json
const fs = require('fs');
const Discord = require('discord.js');
const configPath = './config.json';
const config = require(configPath);
const Counting = require('./counting.js');
const wait = require('util').promisify(setTimeout);
const listPath = './gamelist.json';
const gameList = require(listPath);
const dataLogger = require('./datalog.js');

// initialize client, commands, command cooldown collections
const client = new Discord.Client();
client.commands = new Discord.Collection();
const cooldowns = new Discord.Collection();

// read command files
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  // set a new item in the Collection
  // with the name attribute as the command name and the value as the exported module
  client.commands.set(command.name, command);
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

// since the datalogger takes some time to cache messages, especially on larger servers, create a check digit to block unwanted processing of new messages during datalogging
let dataLogLock = 0;

// when the client is ready, run this code.
client.on('ready', async () => {
  console.log('Ready!');
  client.user.setActivity(config.currentActivity.Name, { type: config.currentActivity.Type });
  Counting.OnReady(config, client);
  // Lock datalog while caching offline messages. When that finishes, the callback will unlock the log.
  dataLogLock = 1;
  console.log('Fetching offline messages...');
  dataLogger.OnReady(config, client, function() {
    dataLogLock = 0;
    console.log('Offline message fetch complete!');
  });
  // wait 1000ms without holding up the rest of the script. This way we can ensure recieving all guild invite info.
  await wait(1000);
  client.guilds.forEach(g => {
    g.fetchInvites().then(guildInvites => {
      invites[g.id] = guildInvites;
    });
  });
});

// login to Discord with your app's token
client.login(config.authtoken);

// command parser
client.on('message', async message => {
  // only do datalogging on non-DM text channels. Don't process messages while offline retrieval is proceeding.
  if (message.channel.type === 'text' && dataLogLock != 1) { dataLogger.OnMessage(message); }
  if(Counting.HandleMessage(message)) {
    return;
  }
  // prevent parsing commands without correct prefix, from bots, and from non-staff non-comrades.
  if (!message.content.startsWith(config.prefix) || message.author.bot) return;
  if (message.channel.type == 'text' && !(message.member.roles.has(config.roleStaff) || message.member.roles.has(config.roleComrade))) return;

  const args = message.content.slice(config.prefix.length).split(/ +/);
  let commandName = args.shift().toLowerCase();

  // handle using help as an argument
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
  if (command.staffOnly && !message.member.roles.has(config.roleStaff)) return;

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
  else if (packet.t === 'MESSAGE_REACTION_ADD') {

    const { d: data } = packet;
    const user = client.users.get(data.user_id);
    const channel = client.channels.get(data.channel_id) || await user.createDM();

    // prevent confusion between cached and uncached messages; ensure event only occurs once per message
    // NOTE: I commented this out because it does not seem to work.
    // if (channel.messages.has(data.message_id)) return;

    // fetch info about the message the reaction was added to.
    const message = await channel.fetchMessage(data.message_id);
    // custom emojis reactions are keyed in a `name:ID` format, while unicode emojis are keyed by names
    const emojiKey = (data.emoji.id) ? `${data.emoji.name}:${data.emoji.id}` : data.emoji.name;
    const reaction = message.reactions.get(emojiKey);

    // If the message somehow doesn't have any reactions on it, or the channel type is not a guild text channel (like a DM for example),
    // do not emit a reaction add event.
    if (!reaction || message.channel.type !== 'text') return;
    // emit event with details of the message and sender.
    client.emit(events[packet.t], reaction, user, message);
  }
});

// Handler for reaction added
client.on('messageReactionAdd', (reaction, user, message) => {
  if (message == null || message.system) return;
  if (reaction.emoji.name == '📌' && reaction.count >= config.pinsToPin && !message.pinned && !config.pinIgnoreChannels.includes(message.channel.id)) {
    console.log('Attempting to pin a message in ' + message.channel);
    message.pin();
    return;
  }
  if (reaction.emoji.name == '🔖') {
    console.log('Attempting to PM a message from ' + message.channel + ' to ' + user);
    const messagesent = new Date(message.createdTimestamp).toLocaleString('en-US', { timeZone: 'UTC' });
    const guild = message.guild;
    const guildmember = guild.member(message.author);
    const bookmarkEmbed = new Discord.RichEmbed()
      .setColor('#0099ff')
      .setAuthor(guildmember.displayName, message.author.displayAvatarURL)
      .setDescription(message.content + '\n\n [jump to message](' + message.url + ')')
      .setFooter('Bookmarked message was sent at ' + messagesent + ' UTC');
    user.send('🔖: - from ' + message.channel, bookmarkEmbed);
    return;
  }
});

// whenever client completes session resume, run this code.
client.on('Resumed', async () => {
  // Lock datalog while caching offline messages. When that finishes, the callback will unlock the log.
  dataLogLock = 1;
  dataLogger.OnReady(config, client, function() {
    dataLogLock = 0;
  });
  await wait(1000);
  // cache invites from server.
  client.guilds.forEach(g => {
    g.fetchInvites().then(guildInvites => {
      invites[g.id] = guildInvites;
    });
  });
});

// very basic error handling.
// console will log the error but take no further action.
// if the error is not fatal the bot will continue running.
client.on('error', err => {
  const date = new Date().toLocaleString();
  const ErrTargetPrototype = Object.getPrototypeOf(err.target);
  // If the error is a network error, display error message.
  if (ErrTargetPrototype.constructor.name == 'WebSocket') {
    console.log('[' + date + ']: Connection Error! The error was: "' + err.message + '". Will automatically attempt to reconnect.');
    return;
  }
  // Else, display full error object.
  else {
    console.error('[' + date + ']:' + err);
    return;
  }
});

client.on('guildMemberAdd', member => {
  if (config.invLogToggle) {
    const logChannel = client.channels.get(config.channelInvLogs);
    // load the current invite list.
    member.guild.fetchInvites().then(guildInvites => {
      try {
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
        const inviter = client.users.get(invite.inviter.id);
        // A real basic message with the information we need.
        logChannel.send(`${member} (${member.user.tag} / ${member.id}) joined using invite code **${invite.code}** from ${inviter} (${inviter.tag}). This invite has been used **${invite.uses}** times since its creation.`);
      }
      catch {
        logChannel.send(`${member} (${member.user.tag} / ${member.id}) joined the server, but no invite information was available.`);
      }
    });
  }
});

client.on('guildMemberRemove', member => {
  const logChannel = client.channels.get(config.channelInvLogs);
  const data = [];
  logChannel.send(`${member} (${member.user.tag} / ${member.id}) left the server.`);
  Object.keys(gameList).forEach(sysname => {
    if (!gameList[sysname].accounts[0]) return;
    const accountInfo = gameList[sysname].accounts.filter(info => info.userID === member.id);
    if (accountInfo[0]) {
      const accountIndex = gameList[sysname].accounts.findIndex(info => info.userID === member.id);
      gameList[sysname].accounts.splice(accountIndex, 1);
      data.push(sysname);
    }
  });
  fs.writeFile(listPath, JSON.stringify(gameList, null, 2), function(err) {
    if (err) {
      logChannel.send('There was an error updating games list information for exited user!');
      return console.log(err);
    }
  });
  console.log(`User exited - removed ${member.user.tag} from the following game rosters: ${data.join(', ')}`);
});

process.on('unhandledRejection', error => console.error('Uncaught Promise Rejection! Error details:\n', error));
