const fs = require('fs');
const path = require('path');
const configPath = path.resolve('./config.json');
const config = require(configPath);
const listPath = path.resolve('./gamelist.json');
const gameList = require(listPath);

module.exports = {
	name: 'games',
	description: 'Display/manage rosters for the specified game or system.\n\nArguments:\nAdd: Add or update your roster information for a game/system.\nList: List available games/systems\nRemove: Remove your profile info from one or all rosters.',
	aliases: [],
	usage: '[add] [system] [account name/code] to add yourself to a roster.\n' + config.prefix + 'games [list] to see all roster options, or ' + config.prefix + 'games [list] [system] to see the roster for a given system.\n' + config.prefix + 'games [remove] [system], or ' + config.prefix + 'games [remove] [all] to strip all your accounts from the system',
	cooldown: 3,
	args: true,
	guildOnly: true,
	execute(message, args) {
		function capitalize(str) {
			return str.replace(/(?:^\w|\b\w)/g, function(ltr) {
				return ltr.toUpperCase();
			});
		}

		function writegameList() {
			fs.writeFile(listPath, JSON.stringify(gameList, null, 2), function(err) {
				if (err) {
					message.channel.send('There was an error saving your account information!');
					return console.log(err);
				}
			});
		}

		const action = args[0].toLowerCase();
		if (action === 'add') {
			if (!args[1]) {
				message.channel.send('Sorry, I need a system name and your account info to add anything!');
				return;
			}
			const system = args[1].toLowerCase();
			args.splice(0, 2);
			const accountname = args.join(' ');
			if (!gameList.hasOwnProperty(system)) {
				message.channel.send('I\'m sorry, I don\'t have any rosters for that system... check your spelling, or try \'' + config.prefix + 'games list\' to see a list of systems available.');
				return;
			}
			if (!accountname) {
				message.channel.send('I\'ll need an account name if I\'m going to add you to the roster!');
			}
			const accountInfo = gameList[system].accounts.filter(info => info.userID === message.member.id);
			if (!accountInfo[0]) {
				gameList[system].accounts.push({ userID: message.member.id, account: accountname });
				message.channel.send('Successfully added you to my roster for ' + capitalize(system) + '!');
				writegameList();
			}
			else {
				const accountIndex = gameList[system].accounts.findIndex(info => info.userID === message.member.id);
				gameList[system].accounts[accountIndex] = { userID: message.member.id, account: accountname };
				message.channel.send('Successfully updated you on my roster for ' + capitalize(system) + '!');
				writegameList();
			}

		}
		else if (action === 'list') {
			const data = [];
			if (!args[1]) {
				Object.keys(gameList).forEach(sysname => data.push(capitalize(sysname)));
				message.channel.send('Here are the systems I maintain rosters for:\n' + data.join('\n'));
			}
			else {
				const system = args[1].toLowerCase();
				if (!gameList[system].accounts[0]) {
					message.channel.send('I don\'t have anyone on that roster yet.  Will you be the first?');
					return;
				}
				gameList[system].accounts.forEach(acctinfo => {
					const guild = message.guild;
					const guildmember = guild.member(acctinfo.userID);
					data.push(guildmember.displayName + ' - ' + acctinfo.account);
				});
				message.channel.send('Here is my roster for ' + capitalize(system) + ':\n' + data.join('\n'));
			}
		}
		else if (action === 'remove') {
			if (!args[1]) {
				message.channel.send('Sorry, I need a system name and your account info to remove anything!');
				return;
			}
			const system = args[1].toLowerCase();
			if (system == 'all') {
				Object.keys(gameList).forEach(sysname => {
					console.log('Deleting ' + sysname + ' data...');
					if (!gameList[sysname].accounts[0]) return;
					const accountInfo = gameList[sysname].accounts.filter(info => info.userID === message.member.id);
					if (accountInfo[0]) {
						const accountIndex = gameList[sysname].accounts.findIndex(info => info.userID === message.member.id);
						gameList[system].accounts.splice(accountIndex, 1);
					}
				});
				writegameList();
				message.channel.send('Successfully removed you from all game rosters.');
				return;
			}
			else if (!gameList.hasOwnProperty(system)) {
				message.channel.send('I\'m sorry, I don\'t have any rosters for that system... check your spelling, or try \'' + config.prefix + 'games list\' to see a list of systems available.');
				return;
			}
			const accountInfo = gameList[system].accounts.filter(info => info.userID === message.member.id);
			if (!accountInfo[0]) {
				message.channel.send('I don\'t seem to see you on that roster.');
				return;
			}
			else {
				const accountIndex = gameList[system].accounts.findIndex(info => info.userID === message.member.id);
				gameList[system].accounts.splice(accountIndex, 1);
				writegameList();
				message.channel.send('Successfully removed you from the roster for ' + capitalize(system) + '.');
				return;
			}
		}
	},
};