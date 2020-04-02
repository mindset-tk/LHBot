const fs = require('fs');
const path = require('path');
const dataLogPath = path.resolve('./datalog.json');
if(global.dataLog == null) {
  global.dataLog = require(dataLogPath);
}
const wait = require('util').promisify(setTimeout);
/* global BigInt */

// Function to take a timestamp and convert to YYYY-MM format.
function formatDate(timestamp) {
  const messageDate = new Date(timestamp);
  const month = (messageDate.getMonth() + 1);
  const year = messageDate.getFullYear();
  const dateString = year + '-' + ((month < 10) ? ('0' + month) : month);
  return dateString;
}

// Function to take an YYYY-MM datestring and increment the month by 1.
function monthPlusOne(dateString) {
  const dateArray = dateString.split('-');
  let year = parseInt(dateArray[0]);
  let month = parseInt(dateArray[1]);
  if (month != 12) {
    month++;
  }
  else if (month == 12) {
    year++;
    month = 1;
  }
  const nextMonth = year + '-' + ((month < 10) ? ('0' + month) : month);
  return nextMonth;
}

// Function to write to .json file for session persistence.
function writeData() {
  fs.writeFile(dataLogPath, JSON.stringify(global.dataLog, null, 2), function(err) {
    if (err) {
      return console.log(err);
    }
  });
}

function publicOnMessage(message) {
  // Format a YYYY-MM date string, then push message data through the dataLog object
  const dateString = formatDate(message.createdTimestamp);
  let numMsgData = new Map();
  // If an entry for the channel doesn't exist in the object, initialize it.
  if (!global.dataLog[message.guild.id][message.channel.id]) {
    global.dataLog[message.guild.id][message.channel.id] = { channelName:message.channel.name, lastMessageID:null, numMessages:[] };
  }
  // Then, if the number of messages entry doesn't exist, initialize that with a count of 1.
  if (!global.dataLog[message.guild.id][message.channel.id].numMessages) {
    numMsgData.set(dateString, 1);
    numMsgData = new Map([...numMsgData.entries()].sort());
    global.dataLog[message.guild.id][message.channel.id].numMessages = [...numMsgData];
  }
  // Otherwise, get the numMessages array as a an ES6 map
  else {
    numMsgData = new Map(global.dataLog[message.guild.id][message.channel.id].numMessages);
    // If there's no element in numMessages that corresponds to the date string, initialize it at 1 message for that month.
    if (!numMsgData.get(dateString)) {
      numMsgData.set(dateString, 1);
    }
    // Otherwise increment the number of messages for that month by 1 and store it back in the dataLog.
    else {
      let msgNo = numMsgData.get(dateString);
      msgNo++;
      numMsgData.set(dateString, msgNo);
    }
    numMsgData = new Map([...numMsgData.entries()].sort());
    global.dataLog[message.guild.id][message.channel.id].numMessages = [...numMsgData];
  }
  // Finally, check if the message ID is larger than the lastMessageID entered in dataLog. If so, store it as the lastMessageID.
  if ((parseInt(message.id) > parseInt(global.dataLog[message.guild.id][message.channel.id].lastMessageID)) || !global.dataLog[message.guild.id][message.channel.id].lastMessageID) {
    global.dataLog[message.guild.id][message.channel.id].lastMessageID = message.id;
  }
  writeData();
}

async function restoreMessages(client, callback) {
  let retrievedMessages = 0;
  // console.log('Fetching offline messages...');
  do {
    retrievedMessages = 0;
    for (let g of await client.guilds.cache) {
      g = g[1];
      // check if log has the info for this guild. if not, create an entry that we'll push channel info into
      if (!global.dataLog[g.id]) {
        global.dataLog[g.id] = { guildName: g.name };
      }
      for (let gc of g.channels.cache) {
        gc = gc[1];
        // check if each channel has an entry in the log. if not, create a new property with info about the channel.
        if (gc.type === 'text' && !global.dataLog[g.id][gc.id] && gc.permissionsFor(g.me).has(['VIEW_CHANNEL', 'READ_MESSAGE_HISTORY'])) {
        // initialize data for new channel
          global.dataLog[g.id][gc.id] = { channelName:gc.name, lastMessageID:null, numMessages:[] };
          writeData();
        }
        if (gc.lastMessageID != null && gc.permissionsFor(g.me).has(['VIEW_CHANNEL', 'READ_MESSAGE_HISTORY'])) {
        // if the channel doesn't have a null lastMessage, we can just iterate back to the most recent seen message.
          if (global.dataLog[g.id][gc.id].lastMessageID) {
            let lastSeenMessage = global.dataLog[g.id][gc.id].lastMessageID;
            let numMsgsFetched = 0;
            let loopbreaker = 0;
            let prevLastSeen;
            // fetch messages repeatedly, looping until the guild's last message ID matches our last message ID.
            while (gc.lastMessageID != lastSeenMessage && loopbreaker < 2) {
              prevLastSeen = lastSeenMessage;
              await gc.messages.fetch({ limit: 100, after: lastSeenMessage }).then(messages => {
                if (messages.size > 0) {
                  for (let message of messages) {
                    message = message[1];
                    publicOnMessage(message);
                  }
                  numMsgsFetched += messages.size;
                }
                lastSeenMessage = global.dataLog[g.id][gc.id].lastMessageID;
              });
              // if the last message in a channel was deleted, there will be a mismatch in gc.lastMessageID, leading to an infinite loop.
              // if that happens, since lastSeenMessage isn't being changed, this conditional will break the loop after 2 tries.
              if (prevLastSeen === lastSeenMessage) {
                loopbreaker++;
              }
              // Slowing things down to avoid API spam.
              await wait(200);
            }
            retrievedMessages += numMsgsFetched;
            if (numMsgsFetched > 0) { console.log(`Fetched ${numMsgsFetched} offline messages in #${gc.name}.`); }
          }
          // if it was a new channel when we last wrote data, we need to do a little more work to iterate back to the first message ever sent, since we don't know the ID of the first message sent.
          else if (!global.dataLog[g.id][gc.id].lastMessageID) {
            let oldestSeenMessageID = gc.lastMessageID;
            let numMsgsFetched = 0;
            let prevOldest;
            // first, pull info for the most recent message in the channel.
            // this is necessary because the "before:" param on messages.fetch will not include the message that is within that param.
            if (gc.lastMessageID != null) {
              await gc.messages.fetch(gc.lastMessageID)
                .then(lastmsg => publicOnMessage(lastmsg))
                .catch(err => {
                  if (err.name == 'DiscordAPIError' && err.message == 'Unknown Message') {
                    console.log('Last message in #' + gc.name + ' was deleted or invalid. Ignoring.');
                  }
                  else { console.log('Error Fetching Message!', err); }
                });
            }
            // then, using the "before:" param of messages.fetch,
            // loop fetching messages until the oldest seen message no longer changes.
            do {
              prevOldest = oldestSeenMessageID;
              await gc.messages.fetch({ limit: 100, before: oldestSeenMessageID }).then(messages => {
                if (messages.size > 0) {
                  for (let message of messages) {
                    message = message[1];
                    publicOnMessage(message);
                    oldestSeenMessageID = Math.min(parseInt(message.id), parseInt(oldestSeenMessageID)).toString();
                  }
                  numMsgsFetched += messages.size;
                }
              });
              await wait(200);
            }
            while (oldestSeenMessageID != prevOldest);
            retrievedMessages += numMsgsFetched;
            if (numMsgsFetched > 0) { console.log(`Fetched ${numMsgsFetched} offline messages in #${gc.name}.`); }
          }
        }
      }
    }
  }
  while (retrievedMessages > 0);
  // console.log('Offline message fetch complete!');
  // When bot.js calls this function, it sets a check var to prevent onMessage from being called mid fetch.
  // the callback there unlocks the dataLog file so that future messages will continue incrementing the count.
  callback();
}

async function uniqueUserCounter(client) {
  // get current month in YYYY-MM format
  const nowString = formatDate(new Date());
  for (const gID of Object.keys(global.dataLog)) {
    const g = await client.guilds.cache.get(gID);
    if (!global.dataLog[gID].guildUniqueUsers) {
      global.dataLog[gID].guildUniqueUsers = [];
    }
    const guildMap = new Map(global.dataLog[gID].guildUniqueUsers);
    const guildUsrMap = new Map;
    // we're gonna format guildusrMap like this [month, arrayofusrs]
    for (const cID of Object.keys(global.dataLog[gID])) {
      let skip = 0;
      const gc = await g.channels.cache.get(cID);
      if (!global.dataLog[gID][cID].numMessages) { skip = 1;}
      // create uniqueUsers arr if it doesn't exist
      else if (!global.dataLog[gID][cID].uniqueUsers) {
        global.dataLog[gID][cID].uniqueUsers = [];
      }
      if (!skip == 1) {
        const msgMap = new Map(global.dataLog[gID][cID].numMessages);
        const usrMap = new Map(global.dataLog[gID][cID].uniqueUsers);
        // console.log(usrMap);
        // delete the entry from numMessages for the current month since the month is not over.
        msgMap.delete(nowString);
        // then return if there's no more data in numMessages (ie, if the first time this channel has been used is this month)
        if (!msgMap.size == 0) {
          for (const monthData of msgMap) {
            const month = monthData[0];
            let guildUsrArr = [];
            if (guildUsrMap.has(month)) {
              guildUsrArr = guildUsrMap.get(month);
            }
            // iterate through the remainder of msgMap, and if there's already an entry in the unique user list, return.
            if (!usrMap.has(month)) {
              // otherwise, we will iterate through all the messages for that month and then cache them into an array.
              // initialize the timestamps for the start of this month and the start of next month.
              const startOfMonth = Date.parse(month + '-01');
              // technically, endOfMonth is really the first ms in the start of the next month... but a collision here is highly unlikely due to how discord generates snowflakes.
              const endOfMonth = Date.parse(monthPlusOne(month) + '-01');
              // since the messages.fetch method only takes messageIDs, we have to generate fake message IDs for messages created in the first and last ms of the month.
              const startOfMonthID = (BigInt(startOfMonth.valueOf()) - BigInt(1420070400000)) << BigInt(22);
              const endOfMonthID = (BigInt(endOfMonth.valueOf()) - BigInt(1420070400000)) << BigInt(22);
              // init loop variables
              let lastSeenMessage = startOfMonthID;
              let loopbreaker = 0;
              let prevLastSeen;
              let newestMsg = 0;
              const userArr = [];
              // fetch messages repeatedly, looping until the guild's last message ID matches our last message ID.
              while (endOfMonthID > lastSeenMessage && loopbreaker < 2) {
                prevLastSeen = lastSeenMessage;
                await gc.messages.fetch({ limit: 100, after: lastSeenMessage }).then(messages => {
                  if (messages.size > 0) {
                    for (let message of messages) {
                      message = message[1];
                      if (!userArr.includes(message.author.id) && message.id < endOfMonthID && !message.author.bot) {userArr.push(message.author.id);}
                      if (!guildUsrArr.includes(message.author.id) && message.id < endOfMonthID && !message.author.bot) { guildUsrArr.push(message.author.id);}
                      if (message.id > newestMsg) {newestMsg = message.id;}
                    }
                  }
                  lastSeenMessage = newestMsg;
                });
                // if the channel hasn't been used since the month turned over, the loop would never break since it would never find a messageID later than the end of the month.
                // if that happens, since lastSeenMessage isn't being changed, this conditional will break the loop after 2 tries.
                if (prevLastSeen === lastSeenMessage) {
                  loopbreaker++;
                }
                await wait(200);
              }
              guildUsrMap.set(month, guildUsrArr);
              usrMap.set(month, userArr.length);
            }
          }
        }
        global.dataLog[gID][cID].uniqueUsers = [...usrMap];
      }
    }
    for (const monthData of guildUsrMap) {
      const month = monthData[0];
      const monthUsrs = monthData[1];
      guildMap.set(month, monthUsrs.length);
    }
    global.dataLog[gID].guildUniqueUsers = [...guildMap];
    writeData();
  }
}

function publicOnReady(config, client, callback) {
  restoreMessages(client, callback);
  uniqueUserCounter (client);
}

exports.OnReady = publicOnReady;
exports.OnMessage = publicOnMessage;