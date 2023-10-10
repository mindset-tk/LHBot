const fs = require('fs');
const path = require('path');
const configPath = path.resolve('./config.json');
const config = require(configPath);
const listPath = path.resolve('./gamelist.json');
const gameList = require(listPath);
const Discord = require('discord.js');
const { getPermLevel } = require('../extras/common.js');
// TODO sql-ify
module.exports = {
  name: 'games',
  description: 'Display/manage rosters for the specified game or system.',
  usage: '[add] [system] [account name or friend code] to add yourself to a roster. If you\'re already on that roster, it will update your info.\n' +
		config.prefix + 'games [list] to see all roster options, or ' + config.prefix + 'games [list] [system] to see the roster for a given system.\n' +
    config.prefix + 'games [remove] [system] to remove yourself a single roster, or ' + config.prefix + 'games [remove] [all] to strip all your accounts from all rosters.' +
    '\n Additionally, staff can use ' + config.prefix + 'games [purge] [@mention or discord ID] to remove all accounts from a user automatically' +
		'\n\n*If you leave the server for any reason, please note that your data will be cleared from all rosters.*',
  cooldown: 3,
  args: true,
  guildOnly: true,
  async execute(message, args, client) {
    const permLevel = getPermLevel(message);
    // Quick function to capitalize gamelist output
    function capitalize(str) {
      return str.replace(/(?:^\w|\b\w)/g, function(ltr) {
        return ltr.toUpperCase();
      });
    }

    // Function to write game list data to file
    function writegameList() {
      fs.writeFile(listPath, JSON.stringify(gameList, null, 2), function(err) {
        if (err) {
          message.channel.send('There was an error saving your account information!');
          return console.log(err);
        }
      });
    }

    // function to get a user ID from an @mention
    function getUserFromMention(mention) {
      if (mention.startsWith('<@') && mention.endsWith('>')) {
        mention = mention.slice(2, -1);
        if (mention.startsWith('!')) {
          mention = mention.slice(1);
        }
        return client.users.fetch(mention);
      }
      else {return false;}
    }

    const IdFormat = new RegExp('^(\\d{16,})$');
    // Block for adding a user's data to a given roster
    const action = args[0].toLowerCase();
    if (action === 'add') {
      if (!args[1]) {
        message.channel.send('Sorry, I need a system name and your account info to add anything!');
        return;
      }
      const system = args[1].toLowerCase();
      args.splice(0, 2);
      const accountname = args.join(' ');
      // check inputs and give errors for bad data
      if (!gameList.hasOwnProperty(system)) { return message.channel.send('I\'m sorry, I don\'t have any rosters for that system... check your spelling, or try **' + config.prefix + 'games list** to see a list of systems available.'); }
      if (!accountname) {	return message.channel.send('I\'ll need an account name if I\'m going to add you to the roster!');	}
      // check if user's data is already in the game list.
      const accountInfo = gameList[system].accounts.filter(info => info.userID === message.member.id);
      // add data to table or update existing roster data.
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
      // Columns for game roster output
      const column1 = [];
      const column2 = [];
      // if no args, just list the names of each roster.
      // need to convert this into a rich embed, or otherwise make output look nicer?
      if (!args[1]) {
        const data = [];
        Object.keys(gameList).forEach(sysname => data.push(capitalize(sysname)));
        message.channel.send('Here are the systems I maintain rosters for:\n' + data.join('\n'));
      }
      else {
        // game roster output - error response for bad sysname, then create and send embed if sysname is valid.
        const system = args[1].toLowerCase();
        if (!gameList.hasOwnProperty(system)) { return message.channel.send('I\'m sorry, I don\'t have any rosters for that system... check your spelling, or try **' + config.prefix + 'games list** to see a list of systems available.'); }
        if (!gameList[system].accounts[0]) { return	message.channel.send('I don\'t have anyone on that roster yet.  Will you be the first?'); }
        let numRow = 1;
        gameList[system].accounts.forEach(acctinfo => {
          const guild = message.guild;
          const guildmember = guild.members.cache.get(acctinfo.userID);
          if (guildmember) {
            column1.push('**' + numRow + '.** ' + guildmember.displayName);
            column2.push('**' + numRow + '.** ' + acctinfo.account);
            numRow++;
          }
        });
        if (!column1[0]) { return message.channel.send('Nobody on this server is on that roster!');}
        const gameListEmbed = new Discord.MessageEmbed()
          .setColor(gameList[system].embedColor)
          .setTitle(capitalize(system) + ' Roster')
          .setDescription('*Member Game Profiles for ' + capitalize(system) + '*')
          .addFields([{ name: 'Member', value: column1.join('\n'), inline: true },
            { name: 'Account', value: column2.join('\n'), inline: true }]);
        // try to include the embedicon for the system in question.  If this causes an error, log to console and continue sending the embed.
        if (gameList[system].embedIcon) {
          gameListEmbed.setThumbnail(gameList[system].embedIcon);
        }
        message.channel.send({ embeds: [gameListEmbed] });
      }
    }
    // removal block
    else if (action === 'remove') {
      if (!args[1]) { return message.channel.send('Sorry, I need a system name to remove anything!');	}
      const system = args[1].toLowerCase();
      // special case for .games remove all
      if (system == 'all') {
        Object.keys(gameList).forEach(sysname => {
          if (!gameList[sysname].accounts[0]) return;
          const accountInfo = gameList[sysname].accounts.filter(info => info.userID === message.member.id);
          if (accountInfo[0]) {
            const accountIndex = gameList[sysname].accounts.findIndex(info => info.userID === message.member.id);
            gameList[sysname].accounts.splice(accountIndex, 1);
          }
        });
        writegameList();
        message.channel.send('Successfully removed you from all game rosters.');
        return;
      }
      else if (!gameList.hasOwnProperty(system)) { return message.channel.send('I\'m sorry, I don\'t have any rosters for that system... check your spelling, or try **' + config.prefix + 'games list** to see a list of systems available.'); }
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
    else if (action === 'purge' && permLevel == 'staff') {
      let targetUser;
      if (!args[1]) { return message.channel.send('Sorry, I need a user @mention or ID to purge them from the list');	}
      else if (IdFormat.test(args[1])) { targetUser = await client.fetchUser(args[1]); }
      else if (getUserFromMention(args[1])) { targetUser = await getUserFromMention(args[1]); }
      else if (!getUserFromMention(args[1])) { return message.channel.send('Couldn\'t get a user from that. Please @mention the user or type their ID.'); }
      const data = [];
      Object.keys(gameList).forEach(sysname => {
        if (!gameList[sysname].accounts[0]) return;
        const accountInfo = gameList[sysname].accounts.filter(info => info.userID === targetUser.id);
        if (accountInfo[0]) {
          const accountIndex = gameList[sysname].accounts.findIndex(info => info.userID === targetUser.id);
          gameList[sysname].accounts.splice(accountIndex, 1);
          data.push(sysname);
        }
      });
      writegameList();
      if (!data[0]) { return message.channel.send(targetUser.tag + ' was not on any game rosters.'); }
      else {return message.channel.send('Removed ' + targetUser.tag + ' from the following rosters: ' + data.join(' '));}
    }
    else {return message.channel.send('I couldn\'t parse that. try **' + config.prefix + 'help games** to see full information on this command.');}
  },
};