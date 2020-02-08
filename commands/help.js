const { prefix, roleStaff } = require('../config.json');

module.exports = {
	name: 'help',
	description: 'List all of my commands or info about a specific command.',
	aliases: ['commands'],
	usage: '[command name]',
	cooldown: 3,
	execute(message, args) {
		const data = [];
		const { commands } = message.client;
		// If the help invoker is staff, give all commands.
		if (!args.length && message.member.roles.has(roleStaff)) {
			data.push('Here\'s a list of all my commands:');
			// map all command names to an array, filter(Boolean) to remove empty values, then join for clean output
			data.push(commands.map(command => command.name).filter(Boolean).join('\n'));
			data.push(`You can send \`${prefix}help [command name]\` to get info on a specific command!`);

			return message.channel.send(data, { split: true });
		}
		// If the invoker is not staff, but has permission to invoke the command, give only commands available to them.
		if (!args.length && !message.member.roles.has(roleStaff)) {
			data.push('Here\'s a list of commands available to you:');
			// map all non-staffOnly command names to an array, filter(Boolean) to remove empty values, then join for clean output
			data.push(commands.map(command => {if (!command.staffOnly) return command.name;}).filter(Boolean).join('\n'));
			data.push(`You can send \`${prefix}help [command name]\` to get info on a specific command!`);

			return message.channel.send(data, { split: true });
		}
		const name = args[0].toLowerCase();
		const command = commands.get(name) || commands.find(c => c.aliases && c.aliases.includes(name));

		if (!command || (command.staffOnly && !message.member.roles.has(roleStaff))) {
			return message.reply('that\'s not a valid command, or you don\'t have permission to use it!');
		}

		data.push(`**Name:** ${command.name}`);

		if (command.aliases) data.push(`**Aliases:** ${command.aliases.join(', ')}`);
		if (command.description) data.push(`**Description:** ${command.description}`);
		if (command.usage) data.push(`**Usage:** ${prefix}${command.name} ${command.usage}`);

		message.channel.send(data, { split: true });

	},
};