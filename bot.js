// require the filesystem and discord.js modules, and pull data from config.json
const fs = require('fs');
const Discord = require('discord.js');
const { prefix, authtoken, serverID } = require('./config.json');

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
}

// initialize raw events to listen for
const events = {
	// reaction events
	MESSAGE_REACTION_ADD: 'messageReactionAdd',
	RESUMED: 'Reconnected',
};

// when the client is ready, run this code.
// should trigger every time the bot returns to ready state.
client.on('ready', () => {
	console.log('Ready!');
	client.user.setActivity('with pushpins', { type: 'PLAYING' });
});

// login to Discord with your app's token
client.login(authtoken);


/* code in this comment block is used to process incoming commands. It works, but is blocked off until needed to prevent accidental parsing in live environment
client.on('message', message => {

	if (!message.content.startsWith(prefix) || message.author.bot) return;

	const args = message.content.slice(prefix.length).split(/ +/);
	const commandName = args.shift().toLowerCase();

	// checking both command names and aliases, else return from function
	const command = client.commands.get(commandName)
	|| client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));
	if (!command) return;

	// check if command is server only; prevent it from being run in DMs if so.
	if (command.guildOnly && message.channel.type !== 'text') {
		return message.reply('I can\'t execute that command inside DMs!');
	}

	// check if command requires arguments
	if (command.args && !args.length) {
		let reply = 'You didn\'t provide any arguments!';
		if (command.usage) {
			reply += `\nThe proper usage would be: \`${prefix}${command.name} ${command.usage}\``;
		}
		return message.channel.send(reply);
	}

	// check cooldown status
	if (!cooldowns.has(command.name)) {
		cooldowns.set(command.name, new Discord.Collection());
	}

	const now = Date.now();
	const timestamps = cooldowns.get(command.name);
	const cooldownAmount = (command.cooldown || 0.1) * 1000;

	if (timestamps.has(message.author.id)) {
		const expirationTime = timestamps.get(message.author.id) + cooldownAmount;
		if (now < expirationTime) {
			const timeLeft = (expirationTime - now) / 1000;
			return message.channel.send(`please wait ${timeLeft.toFixed(1)} more second(s) before reusing the \`${command.name}\` command.`);
		}
	}
	timestamps.set(message.author.id, now);
	setTimeout(() => timestamps.delete(message.author.id), cooldownAmount);

	try {
		command.execute(message, args, client);
	}
	catch (error) {
		console.error(error);
		message.reply('there was an error trying to execute that command!');
	}

}); */


// Raw event listener. This listens to all actions in discord then emits specialized events for the bot to work with.
// 
client.on('raw', async event => {
	// ensure the 't' field exists on any event read; return if it does not.
	// eslint-disable-next-line no-prototype-builtins
	if (!events.hasOwnProperty(event.t)) return;
	// check if it is a reconnect event and log to console that connection has resumed.
	if (event.t === 'RESUMED') {
		client.emit(events[event.t]);
	}
	else if (event.t === 'MESSAGE_REACTION_ADD') {
		
		const { d: data } = event;
		const user = client.users.get(data.user_id);
		const channel = client.channels.get(data.channel_id) || await user.createDM();
		
		// prevent confusion between cached and uncached messages; ensure event only occurs once per message
		// NOTE: I commented this out because it does not seem to work.
		// if (channel.messages.has(data.message_id)) return;

		// get message and emoji info
		const message = await channel.fetchMessage(data.message_id);
		const emojiKey = (data.emoji.id) ? `${data.emoji.name}:${data.emoji.id}` : data.emoji.name;

		let reaction = message.reactions.get(emojiKey);
		
		// If the message doesn't have any reactions on it, or the channel type is not a guild text channel (like a DM for example), do not emit an event. 
		// This prevents errors when the last reaction is removed from a message.
		if (!reaction || message.channel.type !== 'text') return;
		client.emit(events[event.t], reaction, user, message);
	}
});

// handlers for reaction added/removed
 client.on('messageReactionAdd', (reaction, user, message) => {
	if (message == null || message.system) return;
	if (reaction.emoji.name == '📌' && reaction.count >= 5 && !message.pinned) {
		console.log('Attempting to pin a message in ' + message.channel)
		message.pin();
		return;
	}
	if (reaction.emoji.name == '🔖') {
		console.log('Attempting to PM a message from ' + message.channel + ' to ' + message.author)
		const guild = message.guild;
		const guildmember = guild.member(message.author);
		const bookmarkEmbed = new Discord.RichEmbed()
			.setColor('#0099ff')
			.setTitle(guildmember.displayName)
			.setDescription(message.content);
		user.send('🔖: - from ' + message.channel, bookmarkEmbed);
		return;
	}
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