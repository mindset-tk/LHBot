const fs = require('fs');
const path = require('path');
let config = null;
const dataLogPath = path.resolve('./datalog.json');
if(global.dataLog == null) {
  global.dataLog = require(dataLogPath);
}
const wait = require('util').promisify(setTimeout);


function formatDate(timestamp) {
  const messageDate = new Date(timestamp);
  const month = (messageDate.getMonth() + 1);
  const year = messageDate.getFullYear();
  const dateString = ((month < 10) ? ('0' + month) : month) + '-' + year;
  return dateString;
}

function writeData() {
  fs.writeFile(dataLogPath, JSON.stringify(global.dataLog, null, 2), function(err) {
    if (err) {
      return console.log(err);
    }
  });
}

function publicOnMessage(message) {
  const dateString = formatDate(message.createdTimestamp);
  if (!global.dataLog[message.guild.id][message.channel.id][dateString]) {
    global.dataLog[message.guild.id][message.channel.id][dateString] = {};
    global.dataLog[message.guild.id][message.channel.id][dateString].numMessages = 1;
  }
  else {
    global.dataLog[message.guild.id][message.channel.id][dateString].numMessages++;
  }
  if (parseInt(message.id) > parseInt(global.dataLog[message.guild.id][message.channel.id].lastMessageID)) {
    global.dataLog[message.guild.id][message.channel.id].lastMessageID = message.id;
  }
  writeData();
}

async function restoreMessages(client) {
  for (let g of await client.guilds) {
    g = g[1];
    // check if log has the info for this guild. if not, create an entry that we'll push channel info into
    if (!global.dataLog[g.id]) {
      global.dataLog[g.id] = { guildName: g.name };
    }
    // console.log(g.channels);
    for (let gc of g.channels) {
      gc = gc[1];
      // console.log(gc);
      // check if each channel has an entry in the log. if not, create a new property with info about the channel.
      if (gc.type === 'text' && !global.dataLog[g.id][gc.id] && gc.memberPermissions(g.me).has('READ_MESSAGES') && gc.memberPermissions(g.me).has('READ_MESSAGE_HISTORY')) {
        // initialize data for new channel
        global.dataLog[g.id][gc.id] = { channelName:gc.name, lastMessageID:gc.lastMessageID };
        writeData();
      }
      else if (gc.lastMessageID != null && gc.memberPermissions(g.me).has('READ_MESSAGES') && gc.memberPermissions(g.me).has('READ_MESSAGE_HISTORY')) {
        let lastSeenMessage = global.dataLog[g.id][gc.id].lastMessageID;
        let numMsgsFetched = 0;
        while (gc.lastMessageID != lastSeenMessage) {
          await gc.fetchMessages({ after: lastSeenMessage }).then(messages => {
            if (messages.size > 0) {
              for (let message of messages) {
                message = message[1];
                publicOnMessage(message);
              }
              numMsgsFetched += messages.size;
            }
            lastSeenMessage = global.dataLog[g.id][gc.id].lastMessageID;
            wait(500);
          });
        }
        console.log(`Fetched ${numMsgsFetched} offline messages in #${gc.name}.`);
      }
    }
  }
}

function publicOnReady(lhconfig, client) {
  restoreMessages(client);
}

exports.OnReady = publicOnReady;
exports.OnMessage = publicOnMessage;