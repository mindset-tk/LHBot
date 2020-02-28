const fs = require('fs');
const path = require('path');
let config = null;
const dataLogPath = path.resolve('./datalog.json');
if(global.dataLog == null) {
  global.dataLog = require(dataLogPath);
}

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
  global.dataLog[message.guild.id][message.channel.id].lastMessageID = message.id;
  writeData();
}

function restoreMessages(client) {
  client.guilds.forEach(g => {
    // check if log has the info for this guild. if not, create an entry that we'll push channel info into
    if (!global.dataLog[g.id]) {
      global.dataLog[g.id] = { guildName: g.name };
    }
    g.channels.forEach(gc => {
      // check if each channel has an entry in the log. if not, create a new property with info about the channel.
      if (gc.type === 'text' && !global.dataLog[g.id][gc.id] && gc.memberPermissions(g.me).has('READ_MESSAGES') && gc.memberPermissions(g.me).has('READ_MESSAGE_HISTORY')) {
        // initialize data for each channel
        global.dataLog[g.id][gc.id] = { channelName:gc.name, lastMessageID:gc.lastMessageID };
        writeData();
      }
      else if (gc.lastMessageID != null && gc.memberPermissions(g.me).has('READ_MESSAGES') && gc.memberPermissions(g.me).has('READ_MESSAGE_HISTORY')) {
        gc.fetchMessages({ after: global.dataLog[g.id][gc.id].lastMessageID })
          .then(messages => {
            if (messages.size > 0) {
              messages.forEach(message => publicOnMessage(message));
            }
            console.log(`Recieved ${messages.size} messages in #${gc.name}.`);
          });
      }
    });
  });
}

function publicOnReady(lhconfig, client) {
  restoreMessages(client);
}

exports.OnReady = publicOnReady;
exports.OnMessage = publicOnMessage;