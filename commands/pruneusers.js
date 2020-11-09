const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const ExcelJS = require('exceljs');
const configPath = path.resolve('./config.json');
const config = require(configPath);
const pruneStoragePath = path.resolve('./prunestorage.json');

/*
fs.writeFileSync(filename, '{}', function(err) {
  if (err) return console.log(err);
});
  dataLog = require(dataLogPath);
}
*/

module.exports = {
  name: 'pruneusers',
  description: 'DMs an xls of user activity to the user',
  usage: '',
  cooldown: 0,
  guildOnly: true,
  staffOnly: true,
  args: false,
  async execute(message, args, client) {

    // function to create a message collector.
    async function msgCollector() {
      // let responses = 0;
      let reply = false;
      // create a filter to ensure output is only accepted from the author who initiated the command.
      const filter = input => (input.author.id === message.author.id);
      await message.channel.awaitMessages(filter, { max: 1, time: 60000, errors: ['time'] })
        // this method creates a collection; since there is only one entry we get the data from collected.first
        .then(collected => reply = collected.first())
        .catch(collected => message.channel.send('Sorry, I waited 60 seconds with no response, please run the command again.'));
      // console.log('Reply processed...');
      return reply;
    }

    // save disk space and increase readability
    function prettyPrintJson() {
      const output = JSON.stringify(pruneStorage, function(k, v) {
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

    // Function to write to .json file
    function writeData() {
      fs.writeFile(pruneStoragePath, prettyPrintJson(), function(err) {
        if (err) {
          return console.log(err);
        }
      });
    }


    let maxTimeSinceActive = 0;
    let excludedUsers = new Array();
    const usersToPrune = new Array();
    // Pull the args so we know what we're working with
    switch (args.length) {
    case 3:
    case 2:
      excludedUsers = (args[1].indexOf(',') > -1) ? args[1].split(',') : args[1];
    case 1:
      maxTimeSinceActive = (parseInt(args[0]) ? parseInt(args[0]) : 6);
    }

    // Set the name of the role/channel to be used for prunes. Probably will go in a config soon?
    const pruneTitle = 'prune-limbo';
    // Sets the intro message and description for the prune channel
    const pruneIntro = `If you're in this channel, you've been inactive in the server for at least ${maxTimeSinceActive} months! Rather than kick you outright, we want to give people a chance to potentially rejoin the community`;
    const discordEpoch = BigInt(1420070400000);

    // Initialize the pruneStorage map. No need to import an "old one"- we'll be starting anew either way? maybe i'll change my mind and check for the file instead
    const pruneStorage = new Map();

    // Only proceed if there isn't a prune in process
    // Todo? Potentially offer an option to let them clear out an old one instead of just saying "No"

    if (message.guild.roles.cache.find(role => role.name === pruneTitle)) {
      message.guild.roles.cache.find(role => role.name === pruneTitle).delete('Post-prune cleanup');
    }
    if (message.guild.channels.cache.find(channel => channel.name === pruneTitle)) {
      message.guild.channels.cache.find(channel => channel.name === pruneTitle).delete();
    }
    // return message.channel.send('It looks like there was already a prune in process. You should finish that out first using `.prunekick confirm` or `.prunekick abandon`');


    // Make sure there's data to even process
    if(!global.dataLog[message.guild.id].pruneData || global.dataLogLock == 1) {
      return message.channel.send('There\'s either no prune data right now, or the datalog is still caching');
    }


    const currentTime = moment();
    const pruneData = new Map(global.dataLog[message.guild.id].pruneData.sort((a, b) => a[1] - b[1]).filter(userid => !excludedUsers.includes(userid[0])));
    const xlsUsrList = new ExcelJS.Workbook;
    const listSheet = xlsUsrList.addWorksheet('User List');
    const colHeaders = ['Username', 'Display', 'Last Posted'];
    const colData = [];
    colHeaders.forEach(hdr => {
      if (hdr == 'Last Posted') {
        colData.push({ header: hdr, key: hdr, width: 15, style: { numFmt: 'm/d/yyyy' } });
      }
      else {
        colData.push({ header: hdr, key: hdr, width: 25 });
      }
    });
    listSheet.columns = colData;

    // Loop through the prune data, generating the spreadsheet and prune array for later
    for (const usr of pruneData) {
      const memberObj = await message.guild.member(usr[0]);
      const usrObj = memberObj.user;
      let dateLastActive = 'N/A';
      let formattedDateLastActive;
      if (usr[1] != 0) {
        const lastPostUnixDate = Number((BigInt(usr[1]) >> BigInt(22)) + discordEpoch);
        dateLastActive = moment(lastPostUnixDate);
        formattedDateLastActive = moment(lastPostUnixDate).toDate();
      }
      else {
        formattedDateLastActive = dateLastActive;
      }
      if (dateLastActive !== 'N/A') {
        const timeSinceLastActive = moment.duration(currentTime.diff(dateLastActive)).asDays();
        if (timeSinceLastActive < maxTimeSinceActive) {break;}
      }
      // Add each user to the spreadsheet
      listSheet.addRow({ Username: usrObj.tag, Display: memberObj.nickname, 'Last Posted': formattedDateLastActive });
      // Add each userID to an array in case we go ahead with the prune
      usersToPrune.push((usr[0]));
    }
    await xlsUsrList.xlsx.writeFile('./usrs.xlsx');

    // Send the XLS out!
    message.author.send({ files: ['./usrs.xlsx'] });
    // message.channel.send({ files: ['./usrs.xlsx'] });

    // Ask if the user wants to proceed, having had a chance to look at the XLS
    message.channel.send('This will affect the **' + usersToPrune.length + '** people in the spreadsheet above. Are you sure you want to move ahead with removing all their roles and put them in a pruning channel?');
    let reply = await msgCollector();
    if (!reply) { return; }
    if (reply.content.toLowerCase() == 'n' || reply.content.toLowerCase() == 'no') {
      return message.channel.send('Prune canceled');
    }
    else if (reply.content.toLowerCase() == 'y' || reply.content.toLowerCase() == 'yes') {

      /* todo next:
      - check for bot permissions (adding roles, channels, https://discordjs.guide/popular-topics/permissions.html#roles-as-bot-permissions, https://discord.js.org/#/docs/main/stable/class/Permissions?scrollTo=s-FLAGS)
      */

      // Create the to-prune temp role
      message.guild.roles.create({
        data: {
          name: pruneTitle,
          // No default permissions needed
          permissions: 0,
          // Mods can mention the user roles regardless, so this way users can't ping each other
          mentionable: false,
        },
        reason: 'User prune prep',
      })
        .then(async (pruneRole) => {
        // Create the to-prune temp channel
          await message.guild.channels.create(pruneTitle, {
            type: 'text',
            position: 0,
            reason: 'User prune prep',
            topic: pruneIntro,
            rateLimitPerUser: 15,
            permissionOverwrites: [
              {
                id: client.user.id,
                allow: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'EMBED_LINKS', 'USE_EXTERNAL_EMOJIS', 'ADD_REACTIONS', 'MENTION_EVERYONE', 'MANAGE_CHANNELS', 'MANAGE_MESSAGES'],
              },
              {
                id: pruneRole.id,
                allow: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'EMBED_LINKS', 'USE_EXTERNAL_EMOJIS'],
              },
              {
                id: config.roleStaff,
                allow: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'EMBED_LINKS', 'USE_EXTERNAL_EMOJIS', 'ADD_REACTIONS', 'MENTION_EVERYONE'],
              },
            ],
          })
            .then(async (pruneChannel) => {
            // Set slow mode so they can't spam
              await pruneChannel.send(`@rolepinglater: ${pruneIntro}`);
              // Assign the new role to each user
              for (const usr of usersToPrune) {
              // Get the user collection
                const thisUser = await message.guild.members.cache.get(usr);
                // Initialize a section of pruneStorage for this user
                pruneStorage[thisUser.id] = new Array();
                // Store the user's roles in their pruneStorage array
                thisUser.roles.cache.forEach(role => {
                  pruneStorage[thisUser.id].push(role.id);
                });

                await thisUser.roles.set([pruneRole], 'User prune prep');
                // restore roles for now,  chadeletennel, etc
                await thisUser.roles.set(pruneStorage[thisUser.id], 'Restoring user roles');
              }
              writeData();
              return message.channel.send(`Okay, ${usersToPrune.length} members have been prepared for pruning`);

            });
        })
        .catch (e => {
          console.log('Error:', e);
          return message.channel.send('There was an error creating the prune channel, contact the bot owner.');
        });
      /*
      let i = 0;
      let toKick = setInterval(async function() {
        const memberObj = await message.guild.member(members[i][0]);
        const usrObj = memberObj.user;
        //console.log('Kicked: ' + memberObj.nickname);
        //member.send(`You've been kicked from **Caves of Qud** with reason: "please consider rejoining in a week when we're not getting raided"`);
        kickUser(usrObj, "we've had a major, major influx of new users recently, please consider rejoining in a week if you're still interested!");
        setTimeout(function() {
          memberObj.kick("pruned after sseth influx");
        }, 1000);
        if (i == members.length) {
          //if (i == 0) {
          clearInterval(toKick);
        }
        i++;
      }, 15000);
      */
    }
  },
};

/* This is what used to be used to generate prunedata on the fly. I haven't deleted it yet just in case it comes in handy

    if (global.currentlyCaching == 1) {return message.channel.send('Sorry! I\'m busy with someone else\'s request. Please try again in a few minutes.'); }
    global.currentlyCaching = 1;
    message.author.send('Please wait a moment while I cache user data...');
    if (!global.pruneData[message.guild.id]) {
      global.pruneData[message.guild.id] = { guildName: message.guild.name };
    }
    const now = new Date();
    const fakeMsgIdNow = (BigInt(now) - BigInt(1420070400000)) << BigInt(22);

    //const usrMap = new Map;
    const usrMap = global.pruneData[message.guild.id]['pruneData'] ? new Map(global.pruneData[message.guild.id]['pruneData']) : new Map();
    for (let g of await client.guilds.cache) {
      g = g[1];
      const currentGuildUsrs = await g.members.cache;
      for (let gc of g.channels.cache) {
        gc = gc[1];
        if (gc.type === 'text' && gc.permissionsFor(g.me).has(['VIEW_CHANNEL', 'READ_MESSAGE_HISTORY'])) {
          // console.log(gc.name);
          let oldestSeenMessage = fakeMsgIdNow;
          let prevLastSeen;
          if (!global.pruneData[message.guild.id]['lastChecked'])
          {
            prevLastSeen = (discordEpoch) << BigInt(22);
          }
          else {
            prevLastSeen = global.pruneData[message.guild.id]['lastChecked'];
          }
          let oldestMsg = fakeMsgIdNow;
          // fetch messages repeatedly, looping until the channels's last message ID matches our last message ID.
          while (prevLastSeen < oldestSeenMessage) {
            //prevLastSeen = oldestSeenMessage;
            await gc.messages.fetch({ limit: 100, before: oldestSeenMessage }).then(messages => {
              if (messages.size > 0) {
                for (let message of messages) {
                  message = message[1];
                  // if the usrmap doesn't have the author at all, add them with value = message ID, so long as they are still currently in the guild
                  if (!usrMap.has(message.author.id) && !message.author.bot && currentGuildUsrs.has(message.author.id)) {usrMap.set(message.author.id, message.id);}
                  // if the usrmap has the author and the msgID stored is less than (older than) the one we're looking at, replace it.
                  if (!message.author.bot && (usrMap.get(message.author.id) < message.id)) {usrMap.set(message.author.id, message.id);}
                  if (message.id < oldestMsg) {oldestMsg = message.id;}
                }
              }
            });
            oldestSeenMessage = oldestMsg;
            await wait(200);
          }
        }
      }
    }
    for (let g of await client.guilds.cache) {
      g = g[1];
      for (let m of await g.members.cache) {
        m = m[1];
        if (!usrMap.has(m.id) && !m.user.bot) {
          usrMap.set(m.id, 0);
        }
      }
    }
*/