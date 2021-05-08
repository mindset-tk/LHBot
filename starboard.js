const path = require('path');
const Discord = require('discord.js');
const configPath = path.resolve('./config.json');
const config = require(configPath);

/*
TODO UPDATE THIS SCHEMA - CURRENTLY OUT OF DATE
starboard.db schema:
starboard - contains data for starboarded posts
  columns:
    original_id = id of original message that was starboarded.
    channel_id = id of original message channel.
    starboard_id = id of starboard entry.
    starcount = star count as of last update.
    starthreshold = starboard threshold as of the date the item was posted to starboard. Prevents starboard items from dropping off unexpectedly after the star threshold is changed by mods
    user_id = id of user that posted the original message. used to prevent self-starring.
blocked - contains ids of messages and users that were blocked from starboard. Columns: original_msg, user_id
*/
async function publicOnReady(botdb) {
  if (!config.starboardChannelId) {
    console.log('No starboard channel set! Starboard functions disabled.');
    return;
  }
  else if (!config.starThreshold) {
    console.log('Star threshold not set! Starboard functions disabled.');
    return;
  }
  console.log('starboard ready!');
  // uncomment to drop tables at bot start (for debugging purposes)
  // await botdb.run('DROP TABLE IF EXISTS starboard');
  // await botdb.run('DROP TABLE IF EXISTS starsgiven');
  // await botdb.run('DROP TABLE IF EXISTS starboard_blocked');
  await botdb.run('DROP TABLE IF EXISTS starmigrator');
  await botdb.run('DROP TABLE IF EXISTS starsgivenmigrator');
  await botdb.run('DROP TABLE IF EXISTS newstarboard');
  await botdb.run('CREATE TABLE IF NOT EXISTS starboard (original_msg text NOT NULL UNIQUE, starboard_msg text NOT NULL UNIQUE, channel text NOT NULL, author text NOT NULL, starthreshold integer NOT NULL, PRIMARY KEY(original_msg, starboard_msg)) ');
  await botdb.run('CREATE TABLE IF NOT EXISTS starsgiven (original_msg text NOT NULL, stargiver text NOT NULL, UNIQUE(original_msg, stargiver))');
  await botdb.run('CREATE INDEX IF NOT EXISTS idx_starsgiven_originals ON starsgiven(original_msg)');
  await botdb.run('CREATE INDEX IF NOT EXISTS idx_stargiver ON starsgiven(stargiver)');
  await botdb.run('CREATE TABLE IF NOT EXISTS starboard_blocked_messages (original_msg text NOT NULL UNIQUE)');
  await botdb.run('CREATE TABLE IF NOT EXISTS starboard_policies (author text NOT NULL, channel text, is_allow text NOT NULL, UNIQUE(author, channel))');
  // await botdb.run('CREATE TABLE IF NOT EXISTS starboard_policy (original_msg text UNIQUE, author_id, dm_id UNIQUE');
}

// function for adjusting the color of the embed based on number of stars.
// using HSL, it varies luminance of a yellow color based on how much greater starcount is than the threshold, maxing out at 2*threshold;
function embedColor(starcount, threshold) {
  // use a hue of 0.14 (yellow-gold) and a saturation 100%
  const h = 0.14;
  const s = 1;
  // ensure luminance will be between 0.8 and 0.5, and scale smoothly throughout.
  const scaledlum = (((((threshold / starcount) - 0.5) / 0.5) * 0.3) + 0.5);
  const l = Math.max(Math.min((scaledlum), 0.5), Math.min(Math.max((scaledlum), 0.5), 0.8));
  function hue2rgb(p, q, t) {
    if(t < 0) t += 1;
    if(t > 1) t -= 1;
    if(t < 1 / 6) return p + (q - p) * 6 * t;
    if(t < 1 / 2) return q;
    if(t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  // convert to hex
  let r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255).toString(16);
  let g = Math.round(hue2rgb(p, q, h) * 255).toString(16);
  let b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255).toString(16);
  if (r.length < 2) {
    r = '0' + r;
  }
  if (g.length < 2) {
    g = '0' + g;
  }
  if (b.length < 2) {
    b = '0' + b;
  }
  return `#${r}${g}${b}`;
}

async function generateEmbed(message, starcount, starThreshold) {
  const guildmember = message.guild.member(message.author);
  let image = '';
  const embed = new Discord.MessageEmbed()
    .setColor(embedColor(starcount, starThreshold))
    // if guildmember is null (eg, because person has left the guild or is a PK bot, use their raw username)
    .setAuthor(guildmember ? guildmember.displayName : message.author.username, message.author.displayAvatarURL())
    .setDescription(message.content)
    .addField('Source', '[Jump!](' + message.url + ')')
    .setFooter(`${message.author.username}${(message.author.discriminator && message.author.discriminator != '0000') ? `#${message.author.discriminator}` : '' }`)
    .setTimestamp(message.createdTimestamp);
  if (message.attachments.size > 0) {
    // will only work on the first image, currently.
    const isimage = /(jpg|jpeg|png|gif)/gi.test((message.attachments.array()[0].url).split('.').pop());
    // don't add spoilered images to the embed as rich embeds cannot currently contain spoilered images. Prevents unspoilered NSFW/CW content from hitting starboard.
    if (isimage && !message.attachments.array()[0].spoiler && message.attachments.size == 1) {
      image = message.attachments.array()[0].url;
      embed.setImage(image);
    }
    else if (message.attachments.array()[0].spoiler) {
      embed.addField('Attachment', `||[${message.attachments.array()[0].name}](${message.attachments.array()[0].url})||`);
    }
    else if (message.attachments.size == 1) {
      embed.addField('Attachment', `[${message.attachments.array()[0].name}](${message.attachments.array()[0].url})`);
    }
    else if (message.attachments.size > 1) {
      const descarr = [];
      message.attachments.array().forEach(attach => {
        if (attach.spoiler) {
          descarr.push(`||[${attach.name}](${attach.url})||`);
        }
        else { descarr.push(`[${attach.name}](${attach.url})`); }
      });
      embed.addField('Attachments', descarr.join('\n'));
    }
  }
  return embed;
}

function generateEmoji(starcount, threshold) {
  const ratio = starcount / threshold;
  if (ratio < 1.5) { return '⭐'; }
  else if (ratio >= 1.5 && ratio < 2) { return '🌟';}
  else if (ratio >= 2 && ratio < 3) {return '💫';}
  else if (ratio >= 3) {return '✨';}
}

// function to get stars on a message and optional starboard message, but exclude stars from the original author.
// returns an array of userids (for use with starsGivenUpdater())
async function retrieveStarGivers(message, starboardMsg) {
  const pkData = await message.pkQuery();
  const starreacts = await message.reactions.cache.get('⭐');
  const usrArr = [];
  if (starreacts) {
    await starreacts.users.fetch();
    starreacts.users.cache.forEach(user => {
      if (!usrArr.includes(user.id) && user.id != message.author.id && (!pkData || user.id != pkData.author.id)) usrArr.push(user.id);
    });
  }
  if (starboardMsg && starboardMsg.reactions) {
    const starboardreacts = await starboardMsg.reactions.cache.get('⭐');
    if (!starboardreacts) return usrArr;
    await starboardreacts.users.fetch();
    starboardreacts.users.cache.forEach(user => {
      if (!usrArr.includes(user.id) && user.id != message.author.id && (!pkData || user.id != pkData.author.id)) usrArr.push(user.id);
    });
  }
  return usrArr;
}

// function to manage starsgiven DB entries and make necessary updates to starsgiven db.
// origMessage = original message object, usrArr = array of userids that have starred the item
async function starsGivenUpdater(origMessage, usrArr, botdb) {
  let starsChanged = false;
  // retrieve all items from starsgiven table associated with the given msg. returns array of objects in format { stargiver: userid }.
  const starArr = await botdb.all('SELECT stargiver FROM starsgiven WHERE original_msg = ?', origMessage.id);
  for (const { stargiver } of starArr) {
    // for each item of this the array from the starsgiven table, compare to usrArr...
    if (!usrArr.includes(stargiver)) {
      // if usrArr passed to this function does not contain a stargiver item, that must mean the user has removed their star.
      await botdb.run('DELETE FROM starsgiven WHERE original_msg = ? AND stargiver = ?', origMessage.id, stargiver).then((result) => {
        if (result.changes > 0) starsChanged = true;
      });
    }
    else {
      // else if usrarr DOES contain the item, discard it.
      usrArr.splice(usrArr.indexOf(stargiver), 1);
    }
  }
  if (usrArr.length > 0) {
    // remaining items in usrArr do not exist in starsgiven table. attempt to insert into starsgiven.
    for (const usr of usrArr) {
      await botdb.run('INSERT OR IGNORE INTO starsgiven(original_msg, stargiver) VALUES(?, ?)', origMessage.id, usr).then((result) => {
        if (result.changes > 0) starsChanged = true;
      });
    }
  }
  // debug text;
  // console.log(`stars changed ${starsChanged}`);
  return starsChanged;
}

// query main starboard table by original message id. returns undefined if item is not in starboard db.
async function queryByOriginal(id, botdb) {
  const dbData = await botdb.get('SELECT * FROM starboard WHERE original_msg = ?', id);
  return dbData;
}

// query main starboard table by starboard message id. returns undefined if item not in starboard db.
async function queryByStarboard(id, botdb) {
  const dbData = await botdb.get('SELECT * FROM starboard WHERE starboard_msg = ?', id);
  return dbData;
}


async function publicOnStar(message, botdb) {
  if (!config.starboardChannelId || !config.starboardToggle || config.starboardIgnoreChannels.includes(message.channel.id)) return;
  let isBlocked = false;
  // check if user or message are on the blocklist
  const pkData = await message.pkQuery();
  await botdb.get('SELECT * FROM starboard_blocked_messages WHERE user_id = ? OR original_msg = ? OR user_id = ?', message.isPKmessage ? pkData.author.id : message.author.id, message.id)
    .then(result => {
      if(result != null) {isBlocked = true;}
    });
  if (isBlocked) return;
  const starboardChannel = await message.client.channels.fetch(config.starboardChannelId);
  let dbdata;
  // if the starred item was in the starboard, we look up the starboard entry for that message, then change 'message' to point to the original message instead of the starboard message.
  if (message.channel == starboardChannel) {
    dbdata = await queryByStarboard(message.id, botdb);
    try {
      message = await message.client.channels.fetch(dbdata.channel).then(channel => {
        return channel.messages.fetch(dbdata.original_msg);
      });
    }
    catch {
      // edge case where e.g. original channel has been deleted, but we still want to leave the item in the starboard.
      const messageRegEx = /(?:(?:https*:\/\/)*.*discord.*\/channels\/)\d+\/(\d+)\/(\d+)/;
      const urlfield = message.embeds[0].fields.find(field => {
        return field.name == 'Source';
      });
      const target = { chanID: messageRegEx.exec(urlfield.value)[1], msgID: messageRegEx.exec(urlfield.value)[2] };
      await botdb.run('DELETE FROM starboard WHERE original_msg = ?', target.msgID);
      await botdb.run('DELETE FROM starsgiven WHERE original_msg = ?', target.msgID);
      return;
    }
  }
  // ...otherwise we can just search by the original id
  else {
    dbdata = await queryByOriginal(message.id, botdb);
  }
  if (dbdata) {
    // item is already in star db; starboard message should exist. Get starboard message.
    const starboardMsg = await starboardChannel.messages.fetch(dbdata.starboard_msg);
    // pass original message and starboard message to starcounter
    const usrArr = await retrieveStarGivers(message, starboardMsg);
    const starcount = usrArr.length;
    await starsGivenUpdater(message, usrArr, botdb);
    if (starcount >= dbdata.starthreshold) {
      // starcount is above the threshold from when it was starboarded and star count has changed. generate new embed and add data to db.
      const starboardEmbed = await generateEmbed(message, starcount, dbdata.starthreshold);
      const starboardEmoji = generateEmoji(starcount, dbdata.starthreshold);
      starboardMsg.edit(`${starboardEmoji} **${starcount}** ${message.channel}`, starboardEmbed);
    }
    else if (starcount < dbdata.starthreshold) {
      // item has dropped below its original threshold of star reacts. Delete from starboard and db.
      starboardMsg.delete();
      await botdb.run('DELETE FROM starboard WHERE original_msg = ?', message.id);
      await botdb.run('DELETE FROM starsgiven WHERE original_msg = ?', message.id);
    }
  }
  else if (!dbdata) {
    const usrArr = await retrieveStarGivers(message);
    const starcount = usrArr.length;
    if (starcount >= config.starThreshold) {
      // item is new starboard candidate. generate embed and message
      const starboardEmbed = await generateEmbed(message, starcount, config.starThreshold);
      const starboardEmoji = generateEmoji(starcount, config.starThreshold);
      const starboardMsg = await starboardChannel.send(`${starboardEmoji} **${starcount}** ${message.channel}`, starboardEmbed);
      // update starsgiven table and starboard table
      await starsGivenUpdater(message, usrArr, botdb);
      await botdb.run('INSERT INTO starboard(original_msg,starboard_msg,channel,author,starthreshold) VALUES(?,?,?,?,?)', message.id, starboardMsg.id, message.channel.id, message.isPKmessage ? pkData.author.id : message.author.id, config.starThreshold);
    }
    else if (!dbdata && (starcount < config.starThreshold)) {
      // item is not in db and has fewer stars than threshold. do nothing.
      return;
    }
  }
  return;
}

async function publicBlockUser(userid, botdb) {
  // exempting/blocking users from starboard is easy since we don't need to go back and delete old starboard items from them.
  let alreadyBlocked = false;
  try {
    await botdb.run('INSERT OR IGNORE INTO starboard_blocked_messages(user_id) VALUES(?)', userid)
      .then(result => { if(result.changes == 0) {alreadyBlocked = true;}});
    if (alreadyBlocked) { return 'alreadyblocked'; }
    else {
      return 'blocksuccessful';
    }
  }
  catch(error) {
    console.error(`Error adding user to starboard block list! Error details: ${error}`);
    return 'error';
  }
}

async function publicBlockMsg(message, botdb) {
  // exempting/blocking a specific message requires us to check if there's a starboard message already.
  try {
    let dbdata;
    let alreadyBlocked;
    const starboardChannel = await message.client.channels.fetch(config.starboardChannelId);
    if (message.channel == starboardChannel) {
      dbdata = await queryByStarboard(message.id, botdb);
      message = await message.guild.channels.fetch(dbdata.channel).then(channel => {return channel.messages.fetch(dbdata.original_msg);});
    }
    else {
      dbdata = await queryByOriginal(message.id, botdb);
    }
    if (dbdata) {
    // item is already in star db; starboard message should exist. Get starboard message and delete.
      const starboardMsg = await starboardChannel.messages.fetch(dbdata.starboard_msg);
      // use an if statement because this function is also called automatically when a starboard message is deleted.
      if (starboardMsg) { starboardMsg.delete(); }
      await botdb.run('DELETE FROM starboard WHERE original_msg = ?', message.id);
      await botdb.run('DELETE FROM starsgiven WHERE original_msg = ?', message.id);
    }
    await botdb.run('INSERT OR IGNORE INTO starboard_blocked_messages(original_msg) VALUES(?)', message.id)
      .then(result => { if(result.changes == 0) {alreadyBlocked = true;}});
    if (alreadyBlocked) { return 'alreadyblocked'; }
    else {
      return 'blocksuccessful';
    }
  }
  catch(error) {
    console.error(`Error adding message to starboard block list! Error details: ${error}`);
    return 'error';
  }
}

async function publicUnblockUser(userid, botdb) {
  let notBlocked = false;
  try {
    await botdb.run('DELETE FROM starboard_blocked_messages WHERE user_id = ?', userid)
      .then(result => { if(result.changes == 0) {notBlocked = true;}});
    if (notBlocked) { return 'notblocked'; }
    else {
      return 'unblocksuccessful';
    }
  }
  catch(error) {
    console.error(`Error removing user from starboard block list! Error details: ${error}`);
    return 'error';
  }
}

async function publicUnblockMessage(message, botdb) {
  let notBlocked = false;
  try {
    await botdb.run('DELETE FROM starboard_blocked_messages WHERE original_msg = ?', message.id)
      .then(result => { if(result.changes == 0) {notBlocked = true;}});
    if (notBlocked) { return 'notblocked'; }
    else {
      return 'unblocksuccessful';
    }
  }
  catch(error) {
    console.error(`Error removing user from starboard block list! Error details: ${error}`);
    return 'error';
  }
}

async function getMessageFromURL(url, client) {
  const messageRegEx = /(?:(?:https*:\/\/)*.*discord.*\/channels\/)\d+\/(\d+)\/(\d+)/;
  const target = { chanID: messageRegEx.exec(url)[1], msgID: messageRegEx.exec(url)[2] };
  try {
    target.chan = await client.channels.fetch(target.chanID);
    target.msg = await target.chan.messages.fetch(target.msgID);
    return target.msg;
  }
  catch {
    return null;
  }
}


async function publicMigrator(fromChannel, toChannel, replyChannel, botdb) {
  // create a temporary migrator db to integrate extant starboard with migrated; this is a copy of the old starboard.
  await botdb.run('CREATE TABLE IF NOT EXISTS starmigrator (original_msg text NOT NULL UNIQUE, starboard_msg text NOT NULL UNIQUE, channel text NOT NULL, author text NOT NULL, starthreshold integer NOT NULL, PRIMARY KEY(original_msg, starboard_msg))');
  await botdb.run('INSERT INTO starmigrator SELECT * FROM starboard');
  await botdb.run('ALTER TABLE starmigrator RENAME COLUMN starboard_msg TO old_starboard_msg');
  await botdb.run(`ALTER TABLE starmigrator ADD COLUMN old_starboard_channel text NOT NULL DEFAULT ${config.starboardChannelId}`);
  await botdb.run('CREATE TABLE IF NOT EXISTS starsgivenmigrator (original_msg text NOT NULL, stargiver text NOT NULL, UNIQUE(original_msg, stargiver))');
  // create a temporary blank starboard table to push data into. This will be renamed to replace starboard at the end of this process.
  await botdb.run('CREATE TABLE IF NOT EXISTS newstarboard (original_msg text NOT NULL UNIQUE, starboard_msg text NOT NULL UNIQUE, channel text NOT NULL, author text NOT NULL, starthreshold integer NOT NULL, PRIMARY KEY(original_msg, starboard_msg)) ');
  let lastSeenMessage = 0;
  let loopbreaker = 0;
  let prevLastSeen;
  while (fromChannel.lastMessageID != lastSeenMessage && loopbreaker < 2) {
    prevLastSeen = lastSeenMessage;
    await fromChannel.messages.fetch({ limit: 100, after: lastSeenMessage }).then(async messagearr => {
      for (const oldStarboardMsg of messagearr.values()) {
        const urlfield = await oldStarboardMsg.embeds[0].fields.find(field => {
          return field.name == 'Source';
        });
        const targetmsg = await getMessageFromURL(urlfield.value, fromChannel.client);
        if (targetmsg) {
          const pkData = await targetmsg.pkQuery();
          let starThreshold;
          const usrArr = await retrieveStarGivers(targetmsg, oldStarboardMsg);
          // to account for possible differences in star threshold over time, we will assume that any message OVER the current threshold uses the current threshold...
          if (config.starThreshold && usrArr.length >= config.starThreshold) {
            starThreshold = config.starThreshold;
          }
          // ...but any message that doesn't meet that criteria is legacied in with its threshold set to its current star count.
          else { starThreshold = usrArr.length; }
          // add it all to the migrator table and migrator star table.
          await botdb.run('INSERT OR IGNORE INTO starmigrator(original_msg,old_starboard_msg,channel,author,starthreshold,old_starboard_channel) VALUES(?,?,?,?,?,?)', targetmsg.id, oldStarboardMsg.id, targetmsg.channel.id, (targetmsg.isPKmessage ? pkData.author.id : targetmsg.author.id), starThreshold, oldStarboardMsg.channel.id);
          for (const usr of usrArr) {
            await botdb.run('INSERT OR IGNORE INTO starsgivenmigrator(original_msg, stargiver) VALUES(?,?)', targetmsg.id, usr);
          }
        }
        else { replyChannel.send(`Message or channel deleted for starboard item at <${oldStarboardMsg.url}> - Skipping this item.`); }
        // finally if the message id is larger than the oldest one we've seen, update our lastseen.
        if (targetmsg && BigInt(targetmsg.id) > BigInt(lastSeenMessage)) { lastSeenMessage = targetmsg.id; }
      }
    });
    // if the last message in a channel was deleted, there will be a mismatch in channel.lastMessageID, leading to an infinite loop.
    // if that happens, since lastSeenMessage isn't being changed, this conditional will break the loop after 2 tries.
    if (prevLastSeen === lastSeenMessage) {
      loopbreaker++;
    }
  }
  // once the while loop above completes, it's posting time.
  // first, get the migrator table an order by old_starboard_msg, ascending.
  const migratordbdata = await botdb.all('SELECT * FROM starmigrator ORDER BY old_starboard_msg');
  // then run through each item, enumerate data about starboard and original post, and post in new starboard
  for (const dbdata of migratordbdata) {
    const oldstarboardChannel = await fromChannel.client.channels.cache.get(dbdata.old_starboard_channel);
    const originalChannel = await fromChannel.client.channels.cache.get(dbdata.channel);
    const originalMsg = await originalChannel.messages.fetch(dbdata.original_msg);
    const pkData = await originalMsg.pkQuery();
    const oldstarboardMsg = await oldstarboardChannel.messages.fetch(dbdata.starboard_msg);
    const usrArr = await retrieveStarGivers(originalMsg, oldstarboardMsg);
    const starcount = usrArr.length;
    // checking if starcount is greater than 0; edge case relating to
    if (starcount >= dbdata.starthreshold && starcount > 0) {
      const starboardEmbed = await generateEmbed(originalMsg, starcount, dbdata.starthreshold);
      const starboardEmoji = generateEmoji(starcount, dbdata.starthreshold);
      const newStarboardMsg = await toChannel.send(`${starboardEmoji} **${starcount}** ${originalChannel}`, starboardEmbed);
      const starArr = await botdb.all('SELECT stargiver FROM starsgivenmigrator WHERE original_msg = ?', originalMsg.id);
      for (const { stargiver } of starArr) {
      // for each item of this the array from the migratorstars table, compare to usrArr...
        if (!usrArr.includes(stargiver)) {
        // if usrArr passed to this function does not contain a migratorstars item, that must mean the user has removed their star.
          await botdb.run('DELETE FROM starsgivenmigrator WHERE original_msg = ? AND stargiver = ?', originalMsg.id, stargiver);
        }
        else {
        // else if usrarr DOES contain the item, discard it.
          usrArr.splice(usrArr.indexOf(stargiver), 1);
        }
      }
      if (usrArr.length > 0) {
      // remaining items in usrArr do not exist in migratorstars table. attempt to insert into starsgiven.
        for (const usr of usrArr) {
          await botdb.run('INSERT OR IGNORE INTO starsgivenmigrator(original_msg, stargiver) VALUES(?,?)', originalMsg.id, usr);
        }
      }
      await botdb.run('INSERT INTO newstarboard(original_msg,starboard_msg,channel,author,starthreshold) VALUES(?,?,?,?,?)', originalMsg.id, newStarboardMsg.id, originalMsg.channel.id, originalMsg.isPKmessage ? pkData.author.id : originalMsg.author.id, config.starThreshold);
    }
  }
  // TODO drop old tables; cleanup and rename newstarboard and migratorstars to starboard and starsgiven.
  await botdb.run('DROP TABLE IF EXISTS starboard');
  await botdb.run('DROP TABLE IF EXISTS starsgiven');
  await botdb.run('ALTER TABLE newstarboard RENAME TO starboard');
  await botdb.run('ALTER TABLE starsgivenmigrator RENAME TO starsgiven');
  await botdb.run('CREATE INDEX IF NOT EXISTS idx_starsgiven_originals ON starsgiven(original_msg)');
  await botdb.run('CREATE INDEX IF NOT EXISTS idx_stargiver ON starsgiven(stargiver)');
  await botdb.run('DROP TABLE IF EXISTS starmigrator');
}

module.exports = {
  onReady: publicOnReady,
  onStar: publicOnStar,
  blockUser: publicBlockUser,
  blockMsg: publicBlockMsg,
  unblockUser: publicUnblockUser,
  unblockMsg: publicUnblockMessage,
  migrator: publicMigrator,
};