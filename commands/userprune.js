const wait = require('util').promisify(setTimeout);
const fs = require('fs');
const path = require('path');

const ExcelJS = require('exceljs');

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
  name: 'userprune',
  description: 'DMs an xls of user activity to the user',
  usage: '',
  cooldown: 0,
  guildOnly: true,
  staffOnly: true,
  args: false,
  async execute(message, args, client) {
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
      const pruneData = new Map(global.dataLog[message.guild.id].pruneData.sort((a, b) => a[1] - b[1]));
      const xlsUsrList = new ExcelJS.Workbook;
      const listSheet = xlsUsrList.addWorksheet('User List');
      const colHeaders = ['Username', 'Display', 'Last Posted'];
      const colData = [];
      colHeaders.forEach(hdr => {
        colData.push({ header: hdr, key: hdr, width: 25 });
      });
      listSheet.columns = colData;
      // const data = [];
      
      
      for (const usr of pruneData) {
        const memberObj = await message.guild.member(usr[0]);
        const usrObj = memberObj.user;
        let datelastactive = 'N/A';
        if (usr[1] != 0) {
          const msgUnixDate = (BigInt(usr[1]) >> BigInt(22)) + discordEpoch;
          // const dateoptions = { timeZone: 'America/Los_Angeles', timeZoneName: 'short', hour: '2-digit', minute: '2-digit', hour12: false };
          datelastactive = new Date(Number(msgUnixDate));
          // data.push(`${usrObj.tag} last message: ${datelastactive.toLocaleString('en-US', dateoptions)}`);
        }
        
        listSheet.addRow({ Username: usrObj.tag, Display: memberObj.nickname, 'Last Posted': datelastactive });
      }
      //global.pruneData[message.guild.id]['lastChecked'] = fakeMsgIdNow.toString(); 
      await xlsUsrList.xlsx.writeFile('./usrs.xlsx');
      /*
      global.pruneData[message.guild.id].pruneData = [...usrMap];
      //console.log(global.pruneData);
      writeData();
      */

      message.author.send({ files: ['./usrs.xlsx'] });
  //    message.author.send("donezo");
      // message.channel.send(data.join('\n'));
      //global.currentlyCaching = 0;
    }
    else {
      return message.channel.send("Messages are currently being cached, you'll need to wait");
    }
  },
};