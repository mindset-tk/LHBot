const wait = require('util').promisify(setTimeout);
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const ExcelJS = require('exceljs');
const configPath = path.resolve('./config.json');
const config = require(configPath);

/*
// save disk space and increase readability
function prettyPrintJson() {
  const output = JSON.stringify(global.pruneData, function(k, v) {
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
  fs.writeFile(pruneDataPath, prettyPrintJson(), function(err) {
    if (err) {
      return console.log(err);
    }
  });
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

    const discordEpoch = BigInt(1420070400000);
    /*
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
    if(global.dataLog[message.guild.id].pruneData && global.dataLogLock != 1) {
      //change maxTimeSinceActive for live, probably configurable as a default max prune time
      let maxTimeSinceActive = 0;
      let excludedUsers = new Array();
      let usersToPrune = new Array();
      //console.log(excludedUsers);
      switch (args.length) {
        case 3:
        case 2:
          excludedUsers = (args[1].indexOf(',') > -1) ? args[1].split(',') : args[1];
        case 1:
          maxTimeSinceActive = (parseInt(args[0]) ? parseInt(args[0]) : 6);
          break;
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
            
      
      for (const usr of pruneData) {
        const memberObj = await message.guild.member(usr[0]);
        const usrObj = memberObj.user;
        let dateLastActive = 'N/A';
        let formattedDateLastActive;
        if (usr[1] != 0) {
          const lastPostUnixDate = Number((BigInt(usr[1]) >> BigInt(22)) + discordEpoch);
          // const dateoptions = { timeZone: 'America/Los_Angeles', timeZoneName: 'short', hour: '2-digit', minute: '2-digit', hour12: false };
          dateLastActive = moment(lastPostUnixDate);
          formattedDateLastActive = moment(lastPostUnixDate).toDate();
          // data.push(`${usrObj.tag} last message: ${datelastactive.toLocaleString('en-US', dateoptions)}`);
        }
        else {
          formattedDateLastActive = dateLastActive;
        }
        if (dateLastActive !== 'N/A') {
//change this to months on live! also have it read from the first arg
          //const timeSinceLastActive = moment.duration(currentTime.diff(dateLastActive)).asMonths();
          const timeSinceLastActive = moment.duration(currentTime.diff(dateLastActive)).asDays();
          //console.log(timeSinceLastActive);
          if (timeSinceLastActive < maxTimeSinceActive) {break;}
        }
        //Add each user tot he spreadsheet
        listSheet.addRow({ Username: usrObj.tag, Display: memberObj.nickname, 'Last Posted': formattedDateLastActive });
        //Add each userID to an array in case we go ahead with the prune
        usersToPrune.push((usr[0]));
      }
      //global.pruneData[message.guild.id]['lastChecked'] = fakeMsgIdNow.toString(); 
      await xlsUsrList.xlsx.writeFile('./usrs.xlsx');
      /*
      global.pruneData[message.guild.id].pruneData = [...usrMap];
      //console.log(global.pruneData);
      writeData();
      */

      //message.channel.send({ files: ['./usrs.xlsx'] });
      message.author.send({ files: ['./usrs.xlsx'] });
  //    message.author.send("donezo");
      // message.channel.send(data.join('\n'));
      //global.currentlyCaching = 0;

      message.channel.send('This will affect the **' + usersToPrune.length + '** people in the spreadsheet above. Are you sure you want to move ahead with removing all their roles and put them in a pruning channel?');
      let reply = await msgCollector();
      if (!reply) { return; }
      if (reply.content.toLowerCase() == 'n' || reply.content.toLowerCase() == 'no') {
        return message.channel.send('Prune canceled');
      }
      else if (reply.content.toLowerCase() == 'y' || reply.content.toLowerCase() == 'yes') {
        let pruneRole;
        let pruneChannel;
        
/* todo next: 
- check for bot permissions (adding roles, channels, https://discordjs.guide/popular-topics/permissions.html#roles-as-bot-permissions, https://discord.js.org/#/docs/main/stable/class/Permissions?scrollTo=s-FLAGS)
- check for existing tobepruned role and channel
- store and remove old user roles, before addding new role
- command to remove people from the prune list
- command to do a final kick of prune users
*/

        //Create the to-prune temp role
        pruneRole = await message.guild.roles.create({
          data: {
            name: `tobepruned`,
            // No default permissions needed
            permissions: 0,
            // Mods can mention the user roles regardless, so this way users can't ping each other
            mentionable: false,
          },
          reason: `User prune prep`,
        })
        .then(async role => {
          //Create the to-prune temp channel
          pruneChannel = await message.guild.channels.create('tobepruned', {
            type: 'text',
            position: 0,
            reason: "User prune prep",
            topic: "If you're in this channel, you've been inactive in the server for at least " + maxTimeSinceActive + " months! Rather than kick you outright, we want to give people a chance to potentially rejoin the community",
            permissionOverwrites: [
              {
                id: client.user.id,
                allow: ['VIEW_CHANNEL','SEND_MESSAGES','EMBED_LINKS','USE_EXTERNAL_EMOJIS','ADD_REACTIONS','MENTION_EVERYONE','MANAGE_CHANNELS','MANAGE_MESSAGES'],
              },
              {
                id: role.id,
                allow: ['VIEW_CHANNEL','SEND_MESSAGES','EMBED_LINKS','USE_EXTERNAL_EMOJIS'],
              },
              {
                id: config.roleStaff,
                allow: ['VIEW_CHANNEL','SEND_MESSAGES','EMBED_LINKS','USE_EXTERNAL_EMOJIS','ADD_REACTIONS','MENTION_EVERYONE'],
              },
            ],
          })
          .then(async channel => {
            //Set slow mode so they can't spam
            await channel.setRateLimitPerUser(15, "User prune prep");
            //Assign the new role to each user
            for (const usr of usersToPrune) {
              const thisUser = message.guild.members.cache.get(usr);
              await thisUser.roles.add(role.id, 'User prune prep');
            }
            message.channel.send("Okay, " + usersToPrune.length + " members have been prepared for pruning");
          })
          .catch (e => {
            console.log('Error creating prune channel:', e);
            return message.channel.send('There was an error creating the prune channel, contact the bot owner.');
          });
      })
      .catch (e => {
        console.log('Error creating prune role:', e);
        return message.channel.send('There was an error creating the prune role, contact the bot owner.');
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

    }
    else {
      return message.channel.send("Messages are currently being cached, you'll need to wait");
    }
  },
};