const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const fs = require('fs');
const dbpath = ('./db/');
const Discord = require('discord.js');

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


/*
starboard.db schema:
starboard - contains data for starboarded posts
  columns:
    original_id = id of original message that was starboarded.
    channel_id = id of original message channel.
    starboard_id = id of starboard entry.
    starcount = star count as of last update.
    starthreshold = starboard threshold as of the date the item was posted to starboard. Prevents starboard items from dropping off unexpectedly after the star threshold is changed by mods
    user_id = id of user that posted the original message. used to prevent self-starring.
starboard_blocked - contains original ids of messages that were blocked from starboard by mods. only contains one column: original_id.
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

async function generateEmbed(config, message, starcount, starThreshold) {
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

// function to pull star count from a message and optional starboard message, but exclude stars from the original author
async function starCounter(message, starboardMsg) {
  const starreacts = await message.reactions.cache.get('⭐');
  const usrArr = [];
  if (starreacts) {
    await starreacts.users.fetch();
    starreacts.users.cache.forEach(user => {
    // add '&& user.id != message.author.id' to conditional to exclude self-stars.
      if (!usrArr.includes(user.id)) usrArr.push(user.id);
    });
  }
  if (starboardMsg) {
    const starboardreacts = await starboardMsg.reactions.cache.get('⭐');
    if (!starboardreacts) return usrArr.length;
    await starboardreacts.users.fetch();
    starboardreacts.users.cache.forEach(user => {
      // add '&& user.id != message.author.id' to conditional to exclude self-stars.
      if (!usrArr.includes(user.id)) usrArr.push(user.id);
    });
  }
  return usrArr.length;
}

// query main starboard by original message id. returns undefined if item is not in starboard db.
async function queryByOriginal(id) {
  const dbData = await stardb.get(`SELECT * FROM starboard WHERE original_id = ${id}`);
  return dbData;
}

async function queryByStarboard(id) {
  const dbData = await stardb.get(`SELECT * FROM starboard WHERE starboard_id = ${id}`);
  return dbData;
}

function publicOnReady(config) {
  if (!config.starboardChannelId) {
    console.log('No starboard channel set! Starboard functions disabled.');
    return;
  }
  else if (!config.starThreshold) {
    console.log('Star threshold not set! Starboard functions disabled.');
    return;
  }
  stardb.run('CREATE TABLE IF NOT EXISTS starboard (original_id text PRIMARY KEY, channel_id text, starboard_id text NOT NULL, starcount integer, starthreshold integer, user_id text)');
  stardb.run('CREATE TABLE IF NOT EXISTS starboard_blocked (original_id text PRIMARY KEY)');
}

async function publicOnStar(client, config, message) {
  if (!config.starboardChannelId || message.bot) return;
  const starboardChannel = await client.channels.fetch(config.starboardChannelId);
  let dbdata;
  if (message.channel != starboardChannel) {dbdata = await queryByOriginal(message.id);}
  else {
    // if the starred item was in the starboard, we look up the starboard entry for that message, then change 'message' to point to the original message instead of the starboard message.
    dbdata = await queryByStarboard(message.id);
    message = await client.channels.fetch(dbdata.channel_id).then(channel => {return channel.messages.fetch(dbdata.original_id);});
  }
  if (dbdata) {
    // item is in star db. get starboard message.
    const starboardMsg = await starboardChannel.messages.fetch(dbdata.starboard_id);
    // pass original message and starboard message to starcounter
    const starcount = await starCounter(message, starboardMsg);
    if (starcount >= dbdata.starthreshold && starcount != dbdata.starcount) {
      // starcount is above the threshold from when it was starboarded and star count has changed. generate new embed and add data to db.
      const starboardEmbed = await generateEmbed(config, message, starcount, dbdata.starthreshold);
      const starboardEmoji = generateEmoji(starcount, dbdata.starthreshold);
      starboardMsg.edit(`${starboardEmoji} **${starcount}** ${message.channel}`, starboardEmbed);
      await stardb.run(`UPDATE starboard Set starcount = ${starcount} WHERE original_id = ${message.id}`);
    }
    else if (starcount < dbdata.starthreshold) {
      // item has dropped below its original threshold of star reacts. Delete from starboard and db.
      starboardMsg.delete();
      await stardb.run(`DELETE FROM starboard WHERE original_id = ${message.id}`);
    }
  }
  else if (!dbdata) {
    const starcount = await starCounter(message);
    if (starcount >= config.starThreshold) {
      // item is new starboard candidate. generate embed and message and add data to db.
      const starboardEmbed = await generateEmbed(config, message, starcount, config.starThreshold);
      const starboardEmoji = generateEmoji(starcount, config.starThreshold);
      const starboardMsg = await starboardChannel.send(`${starboardEmoji} **${starcount}** ${message.channel}`, starboardEmbed);
      await stardb.run(`INSERT INTO starboard(original_id,channel_id,starboard_id,starcount,starthreshold,user_id) VALUES(${message.id},${message.channel.id},${starboardMsg.id},${starcount},${config.starThreshold},${message.author.id})`);
    }
    else if (!dbdata && (starcount < config.starThreshold)) {
      // item is not in db and has fewer stars than threshold. do nothing.
      return;
    }
  }
  return;
}

exports.onReady = publicOnReady;
exports.onStar = publicOnStar;