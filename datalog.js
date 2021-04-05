const fs = require('fs');
const path = require('path');
const dataLogPath = path.resolve('./datalog.json');
if(global.dataLog == null) {
  global.dataLog = require(dataLogPath);
}
const wait = require('util').promisify(setTimeout);

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

function monthMinusOne(dateString) {
  const dateArray = dateString.split('-');
  let year = parseInt(dateArray[0]);
  let month = parseInt(dateArray[1]);
  if (month != 1) {
    month--;
  }
  else if (month == 1) {
    year--;
    month = 12;
  }
  const lastMonth = year + '-' + ((month < 10) ? ('0' + month) : month);
  return lastMonth;
}

// save disk space and increase readability of datalog.json file.
function prettyPrintJson() {
  const output = JSON.stringify(global.dataLog, function(k, v) {
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

// Function to write to .json file for session persistence.
function writeData() {
  fs.writeFile(dataLogPath, prettyPrintJson(), function(err) {
    if (err) {
      return console.log(err);
    }
  });
}

function publicOnMessage(message, config) {
  if (config.airlockChannel != '' && message.channel.name.includes(config.airlockChannel)) {return;}
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

  // get pruneData array as an ES6 map
  const pruneData = new Map(global.dataLog[message.guild.id].pruneData);
  // If a non-bot user isn't in the pruneData array yet, or has a last-active entry older than this one, then update it
  if(!message.author.bot) {
    if(!pruneData.get(message.author.id)) {
      pruneData.set(message.author.id, [message.id]);
    }
    else if(parseInt(message.id) > parseInt(pruneData.get(message.author.id)[0])) {
      if (!message.guild.member(message.author.id)) {
        pruneData.delete(message.author.id);
      }
      else if (pruneData.get(message.author.id).length === 2) {
        pruneData.set(message.author.id, [message.id, 1]);
      }
      else {
        pruneData.set(message.author.id, [message.id]);
      }
    }
    global.dataLog[message.guild.id].pruneData = [...pruneData];
  }

  writeData();
}

async function restoreMessages(config, client, callback) {
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
        if ((gc.type === 'text' || gc.type === 'news') && !global.dataLog[g.id][gc.id] && gc.permissionsFor(g.me).has(['VIEW_CHANNEL', 'READ_MESSAGE_HISTORY']) && !(config.airlockChannel != '' && gc.name.includes(config.airlockChannel))) {
        // initialize data for new channel
          global.dataLog[g.id][gc.id] = { channelName:gc.name, lastMessageID:null, numMessages:[] };
          writeData();
        }
        if (gc.lastMessageID != null && gc.permissionsFor(g.me).has(['VIEW_CHANNEL', 'READ_MESSAGE_HISTORY']) && !(config.airlockChannel != '' && gc.name.includes(config.airlockChannel))) {
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
                    publicOnMessage(message, config);
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
                .then(lastmsg => publicOnMessage(lastmsg, config))
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
                    publicOnMessage(message, config);
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

// This function actually only tabulates unique data for the previous month and earlier.
// TODO: write a version within xlslog that will tabulate the current month *without* writing to json
// (Writing to JSON would interfere with some data validation within this func.)
async function uniqueUserCounter(config, client) {
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
      if (!gc || (config.airlockChannel != '' && gc.name.includes(config.airlockChannel))) { skip = 1;}
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
      // this if statement guarantees that the bot won't overwrite previous month data if it somehow gains access to a channel after-the-fact.
      if (!guildMap.has(month)) {
        guildMap.set(month, monthUsrs.length);
      }
    }
    global.dataLog[gID].guildUniqueUsers = [...guildMap];
    writeData();
  }
}

// Code to get count of users at end of month.
// Assumes the bot is running 24/7 and is triggered each time the bot resumes
// This is a semiregular occurence that occurs multiple times a day, and this
// function will kick off each time and check if there's a total server users
// for last month at the moment it kicks off. If there's no data for last month
// it then sets the "total users at EOM" for last month to the current total user count.
// Obviously if the bot is off for multiple days this is not going to work.
// TODO: investigate a cron-like tool to do this on a more regular basis.
async function getTotalServerUsers(client) {
  const nowString = formatDate(new Date());
  const lastMonth = monthMinusOne(nowString);
  for (const gID of Object.keys(global.dataLog)) {
    const g = await client.guilds.cache.get(gID);
    await g.members.fetch();
    const srvrUsrCount = await g.members.cache.filter(member => !member.user.bot).size;
    if (!global.dataLog[gID].guildTotalUsers) {
      global.dataLog[gID].guildTotalUsers = [];
    }
    const totUsrMap = new Map(global.dataLog[gID].guildTotalUsers);
    if (!totUsrMap.has(lastMonth)) {
      totUsrMap.set(lastMonth, srvrUsrCount);
    }
    global.dataLog[gID].guildTotalUsers = [...totUsrMap];
    writeData();
  }
}

// This will compare the pruneData array that stores all users' last activity
// to the current guild users, doing a clean-up by removing any users which
// are no longer in the server at the time the command is being run and
// initalizing any users not yet in the log
async function pruneDataMaintenance(client) {
  for (const gID of Object.keys(global.dataLog)) {
    const pruneData = new Map(global.dataLog[gID].pruneData);
    const g = await client.guilds.cache.get(gID);
    const currentGuildUsrs = await g.members.fetch().then(members => members.filter(member => !member.user.bot));
    const usersToAdd = currentGuildUsrs.filter(user => !pruneData.has(user.user.id));
    for (const user of usersToAdd) {
      pruneData.set(user[0], [0]);
    //  console.log("adding " + user[0]);
    }
    if (global.dataLog[gID].pruneData) {
      const usersToRemove = global.dataLog[gID].pruneData.filter(user => !currentGuildUsrs.has(user[0]));
      for (const user of usersToRemove) {
        pruneData.delete(user[0]);
        //    console.log("deleting " + user[0]);
      }
    }
    global.dataLog[gID].pruneData = [...pruneData];
    writeData();
  }
}


function publicOnReady(config, client, callback) {
  pruneDataMaintenance(client);
  restoreMessages(config, client, callback);
  uniqueUserCounter (config, client);
  getTotalServerUsers (client);
}

exports.PruneDataMaintenance = pruneDataMaintenance;
exports.OnReady = publicOnReady;
exports.OnMessage = publicOnMessage;

exports.init = async function(client, config) {
  client.on('raw', async (packet) => {
    if (packet.t === 'RESUMED') {
      // console.log('sharding event!');
      client.dataLogLock = 1;
      publicOnReady(config, client, function() {
        client.dataLogLock = 0;
      });
    }
  });
};