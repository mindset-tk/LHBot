const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const fs = require('fs');
const dbpath = ('./db/');
const Discord = require('discord.js');
const configPath = path.resolve('./config.json');
const config = require(configPath);

// Pull database into memory at program initiation.
let stardb;
try {
  if (!fs.existsSync(dbpath)) {
    fs.mkdirSync(dbpath);
  }
  open({
    filename: `${dbpath}starboard.db`,
    driver: sqlite3.Database,
  }).then((value) => {
    stardb = value;
    console.log('Stardb loaded.');
  });
}
catch (error) { console.error(error); }

// temp code block for big skimmy to go here

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
    .setAuthor(guildmember.displayName, message.author.displayAvatarURL())
    .setDescription(message.content)
    .addField('Source', '[Jump!](' + message.url + ')')
    .setFooter(message.id)
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
  const starreacts = await message.reactions.cache.get('⭐');
  const usrArr = [];
  if (starreacts) {
    await starreacts.users.fetch();
    starreacts.users.cache.forEach(user => {
    // TODO before push: add '&& user.id != message.author.id' to conditional to exclude self-stars;
      if (!usrArr.includes(user.id)) usrArr.push(user.id);
    });
  }
  if (starboardMsg) {
    const starboardreacts = await starboardMsg.reactions.cache.get('⭐');
    if (!starboardreacts) return usrArr;
    await starboardreacts.users.fetch();
    starboardreacts.users.cache.forEach(user => {
      // TODO before push: add '&& user.id != message.author.id' to conditional to exclude self-stars.
      if (!usrArr.includes(user.id)) usrArr.push(user.id);
    });
  }
  return usrArr;
}

// function to manage starsgiven DB entries and make necessary updates to starsgiven db.
// origMessage = original message object, usrArr = array of userids that have starred the item
async function starsGivenUpdater(origMessage, usrArr) {
  let starsChanged = false;
  // retrieve all items from starsgiven table associated with the given msg. returns array of objects in format { stargiver: userid }.
  const starArr = await stardb.all(`SELECT stargiver FROM starsgiven WHERE original_msg = ${origMessage.id}`);
  for (const { stargiver } of starArr) {
    // for each item of this the array from the starsgiven table, compare to usrArr...
    if (!usrArr.includes(stargiver)) {
      // if usrArr passed to this function does not contain a stargiver item, that must mean the user has removed their star.
      await stardb.run(`DELETE FROM starsgiven WHERE original_msg = ${origMessage.id} AND stargiver = ${stargiver}`).then((result) => {
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
      await stardb.run(`INSERT OR IGNORE INTO starsgiven(original_msg, stargiver) VALUES(${origMessage.id},${usr})`).then((result) => {
        if (result.changes > 0) starsChanged = true;
      });
    }
  }
  // debug text;
  console.log(`stars changed ${starsChanged}`);
  return starsChanged;
}

// query main starboard table by original message id. returns undefined if item is not in starboard db.
async function queryByOriginal(id) {
  const dbData = await stardb.get(`SELECT * FROM starboard WHERE original_msg = ${id}`);
  return dbData;
}

// query main starboard table by starboard message id. returns undefined if item not in starboard db.
async function queryByStarboard(id) {
  const dbData = await stardb.get(`SELECT * FROM starboard WHERE starboard_msg = ${id}`);
  return dbData;
}

async function publicOnReady() {
  if (!config.starboardChannelId) {
    console.log('No starboard channel set! Starboard functions disabled.');
    return;
  }
  else if (!config.starThreshold) {
    console.log('Star threshold not set! Starboard functions disabled.');
    return;
  }
  // uncomment to drop tables at bot start (for debugging purposes)
  // await stardb.run('DROP TABLE IF EXISTS starboard');
  // await stardb.run('DROP TABLE IF EXISTS starsgiven');
  // await stardb.run('DROP TABLE IF EXISTS blocked');
  await stardb.run('CREATE TABLE IF NOT EXISTS starboard (original_msg text NOT NULL UNIQUE, starboard_msg text NOT NULL UNIQUE, channel text NOT NULL, author text NOT NULL, starthreshold integer NOT NULL, oldstarboardid, PRIMARY KEY(original_msg, starboard_msg)) ');
  await stardb.run('CREATE TABLE IF NOT EXISTS starsgiven (original_msg text NOT NULL, stargiver text NOT NULL, UNIQUE(original_msg, stargiver))');
  await stardb.run('CREATE INDEX IF NOT EXISTS idx_starsgiven_originals ON starsgiven(original_msg)');
  await stardb.run('CREATE INDEX IF NOT EXISTS idx_stargiver ON starsgiven(stargiver)');
  await stardb.run('CREATE TABLE IF NOT EXISTS blocked (original_msg text UNIQUE, user_id UNIQUE)');
}

async function publicOnStar(client, message) {
  if (!config.starboardChannelId) return;
  let isBlocked = false;
  // check if user or message are on the blocklist
  await stardb.get(`SELECT * FROM blocked WHERE user_id = ${message.author.id} OR original_msg = ${message.id}`)
    .then(result => {
      console.log(result);
      if(result != null) {isBlocked = true;}
    });
  if (isBlocked) return;
  const starboardChannel = await client.channels.fetch(config.starboardChannelId);
  let dbdata;
  // if the starred item was in the starboard, we look up the starboard entry for that message, then change 'message' to point to the original message instead of the starboard message.
  if (message.channel == starboardChannel) {
    dbdata = await queryByStarboard(message.id);
    message = await client.channels.fetch(dbdata.channel).then(channel => {return channel.messages.fetch(dbdata.original_msg);});
  }
  // ...otherwise we can just search by the original id
  else {
    dbdata = await queryByOriginal(message.id);
  }
  if (dbdata) {
    // item is already in star db; starboard message should exist. Get starboard message.
    const starboardMsg = await starboardChannel.messages.fetch(dbdata.starboard_msg);
    // pass original message and starboard message to starcounter
    const usrArr = await retrieveStarGivers(message, starboardMsg);
    const starcount = usrArr.length;
    const starsChanged = await starsGivenUpdater(message, usrArr);
    if (starcount >= dbdata.starthreshold && starsChanged == true) {
      // starcount is above the threshold from when it was starboarded and star count has changed. generate new embed and add data to db.
      const starboardEmbed = await generateEmbed(message, starcount, dbdata.starthreshold);
      const starboardEmoji = generateEmoji(starcount, dbdata.starthreshold);
      starboardMsg.edit(`${starboardEmoji} **${starcount}** ${message.channel}`, starboardEmbed);
      // console.log(starboardMsg.embeds[0].footer.text);
      // await stardb.run(`UPDATE starboard Set starcount = ${starcount} WHERE original_id = ${message.id}`);
    }
    else if (starcount < dbdata.starthreshold) {
      // item has dropped below its original threshold of star reacts. Delete from starboard and db.
      starboardMsg.delete();
      await stardb.run(`DELETE FROM starboard WHERE original_msg = ${message.id}`);
      await stardb.run(`DELETE FROM starsgiven WHERE original_msg = ${message.id}`);
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
      await starsGivenUpdater(message, usrArr);
      await stardb.run(`INSERT INTO starboard(original_msg,starboard_msg,channel,author,starthreshold) VALUES(${message.id},${starboardMsg.id},${message.channel.id},${message.author.id},${config.starThreshold})`);
    }
    else if (!dbdata && (starcount < config.starThreshold)) {
      // item is not in db and has fewer stars than threshold. do nothing.
      return;
    }
  }
  return;
}

async function publicBlockUser(userid) {
  // exempting/blocking users from starboard is easy since we don't need to go back and delete old starboard items from them.
  let alreadyBlocked = false;
  try {
    await stardb.run(`INSERT OR IGNORE INTO blocked(user_id) VALUES(${userid})`)
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

async function publicBlockMsg(message, client) {
  // exempting/blocking a specific message requires us to check if there's a starboard message already.
  try {
    let dbdata;
    let alreadyBlocked;
    const starboardChannel = await client.channels.fetch(config.starboardChannelId);
    if (message.channel == starboardChannel) {
      dbdata = await queryByStarboard(message.id);
      message = await message.guild.channels.fetch(dbdata.channel).then(channel => {return channel.messages.fetch(dbdata.original_msg);});
    }
    else {
      dbdata = await queryByOriginal(message.id);
    }
    if (dbdata) {
    // item is already in star db; starboard message should exist. Get starboard message and delete.
      const starboardMsg = await starboardChannel.messages.fetch(dbdata.starboard_msg);
      // use an if statement because this function is also called automatically when a starboard message is deleted.
      if (starboardMsg) { starboardMsg.delete(); }
      await stardb.run(`DELETE FROM starboard WHERE original_msg = ${message.id}`);
      await stardb.run(`DELETE FROM starsgiven WHERE original_msg = ${message.id}`);
    }
    await stardb.run(`INSERT OR IGNORE INTO blocked(original_msg) VALUES(${message.id})`)
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

async function publicUnblockUser(userid) {
  let notBlocked = false;
  try {
    await stardb.run(`DELETE FROM blocked WHERE user_id = ${userid}`)
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

async function publicUnblockMessage(message) {
  let notBlocked = false;
  try {
    await stardb.run(`DELETE FROM blocked WHERE original_msg = ${message.id}`)
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

module.exports = {
  onReady: publicOnReady,
  onStar: publicOnStar,
  blockUser: publicBlockUser,
  blockMsg: publicBlockMsg,
  unblockUser: publicUnblockUser,
  unblockMsg: publicUnblockMessage,
};