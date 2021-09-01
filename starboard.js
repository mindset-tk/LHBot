const path = require('path');
const Discord = require('discord.js');
const configPath = path.resolve('./config.json');
const config = require(configPath);

/*
TODO UPDATE THIS SCHEMA - CURRENTLY OUT OF DATE
starboard.db schema:
starboard - contains data for individual starboarded posts. Columns: original_msg, starboard_msg, channel, author, starthreshold
starboard_blocked_messages - contains ids of messages that were blocked from starboard. One column: original_msg
starboard_stars - contains data for individual stars. Columns: original_msg, stargiver.
starboard_policies - contains data for stored data relating to user preferences; essentially a combination block/allow list. Columns: author, snowflake, type, allow_starboard.
  on starboard_policies, 'snowflake' shall be the snowflake of the item in question. 'type' shall be either 'channel', 'guildpublic', 'guildprivate', or 'guildall'.
  'allow_starboard' can be true, false, or 'ask'.  'ask' will DM a user for permission to starboard a message.
starboard_limbo - contains data for starboard items that are in an 'ask' state but have not yet been starboard approved by the user. Columns: author channel original_msg dm_id
*/

async function prepTables(botdb) {
  // uncomment to drop tables at bot start (for debugging purposes)
  // await botdb.run('DROP TABLE IF EXISTS starboard');
  // await botdb.run('DROP TABLE IF EXISTS starboard_stars');
  // await botdb.run('DROP TABLE IF EXISTS starboard_message_policies');
  // await botdb.run('DROP TABLE IF EXISTS starboard_policies');
  // await botdb.run('DROP TABLE IF EXISTS starboard_limbo');

  // drop migrator tables in case bot crashed during a star migration.
  await botdb.run('DROP TABLE IF EXISTS starmigrator');
  await botdb.run('DROP TABLE IF EXISTS starboard_starsmigrator');
  await botdb.run('DROP TABLE IF EXISTS newstarboard');
  // ensure standard starboard tables are created.
  await botdb.run('CREATE TABLE IF NOT EXISTS starboard (original_msg text NOT NULL UNIQUE, starboard_msg text NOT NULL UNIQUE, channel text NOT NULL, author text NOT NULL, starthreshold integer NOT NULL, PRIMARY KEY(original_msg, starboard_msg)) ');
  await botdb.run('CREATE TABLE IF NOT EXISTS starboard_stars (original_msg text NOT NULL, stargiver text NOT NULL, UNIQUE(original_msg, stargiver))');
  await botdb.run('CREATE INDEX IF NOT EXISTS idx_starsgiven_originals ON starboard_stars(original_msg)');
  await botdb.run('CREATE INDEX IF NOT EXISTS idx_stargiver ON starboard_stars(stargiver)');
  await botdb.run('CREATE TABLE IF NOT EXISTS starboard_message_policies (original_msg text NOT NULL UNIQUE, author NOT NULL, channel NOT NULL, allow_starboard)');
  await botdb.run('CREATE TABLE IF NOT EXISTS starboard_policies (author text NOT NULL, snowflake text NOT NULL, type NOT NULL, allow_starboard, UNIQUE(author, snowflake, type))');
  await botdb.run('CREATE TABLE IF NOT EXISTS starboard_limbo (author text NOT NULL, channel text NOT NULL, original_msg text NOT NULL UNIQUE, dm_id NOT NULL UNIQUE)');
}

async function publicOnReady(botdb) {
  await prepTables(botdb);
  if (!config.starboardChannelId) {
    console.log('No starboard channel set! Starboard functions disabled.');
    return;
  }
  else if (!config.starThreshold) {
    console.log('Star threshold not set! Starboard functions disabled.');
    return;
  }
  console.log('starboard ready!');
}

function getAuthorAccount(message) {
  return message.isPKmessage ? message.pkData.author.id : message.author.id;
}

function getPublicPrivate(channel) {
  return config.starboardPrivateChannels.includes(channel.id) ? 'guildprivate' : 'guildpublic';
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
      if (!usrArr.includes(user.id)
      // comment this line to enable self-starring.
      && user.id != message.author.id && (!pkData.author || user.id != pkData.author.id)
      ) usrArr.push(user.id);
    });
  }
  if (starboardMsg && starboardMsg.reactions) {
    const starboardreacts = await starboardMsg.reactions.cache.get('⭐');
    if (!starboardreacts) return usrArr;
    await starboardreacts.users.fetch();
    starboardreacts.users.cache.forEach(user => {
      if (!usrArr.includes(user.id)
      // comment this line to enable self-starring.
      && user.id != message.author.id && (!pkData.author || user.id != pkData.author.id)
      ) usrArr.push(user.id);
    });
  }
  return usrArr;
}

// function to manage starboard_stars DB entries and make necessary updates to starboard_stars db.
// origMessage = original message object, usrArr = array of userids that have starred the item
async function starsGivenUpdater(origMessage, usrArr, botdb) {
  let starsChanged = false;
  // retrieve all items from starboard_stars table associated with the given msg. returns array of objects in format { stargiver: userid }.
  const starArr = await botdb.all('SELECT stargiver FROM starboard_stars WHERE original_msg = ?', origMessage.id);
  for (const { stargiver } of starArr) {
    // for each item of this the array from the starboard_stars table, compare to usrArr...
    if (!usrArr.includes(stargiver)) {
      // if usrArr passed to this function does not contain a stargiver item, that must mean the user has removed their star.
      await botdb.run('DELETE FROM starboard_stars WHERE original_msg = ? AND stargiver = ?', origMessage.id, stargiver).then((result) => {
        if (result.changes > 0) starsChanged = true;
      });
    }
    else {
      // else if usrarr DOES contain the item, discard it.
      usrArr.splice(usrArr.indexOf(stargiver), 1);
    }
  }
  if (usrArr.length > 0) {
    // remaining items in usrArr do not exist in starboard_stars table. attempt to insert into starboard_stars.
    for (const usr of usrArr) {
      await botdb.run('INSERT OR IGNORE INTO starboard_stars(original_msg, stargiver) VALUES(?, ?)', origMessage.id, usr).then((result) => {
        if (result.changes > 0) starsChanged = true;
      });
    }
  }
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

async function blockCheck(message, botdb) {
  let isBlocked = false;
  await message.pkQuery();
  // first check if the message is explicitly blocked in starboard_message_policies.
  await botdb.get('SELECT * FROM starboard_message_policies WHERE original_msg = ? AND allow_starboard = ?', message.id, false)
    .then(result => {
      if(result) {isBlocked = true;}
    });
  // then check if the member's messages are blocked at the channel or guild level;
  // false always beats true in this case so a user might have set an individual channel to 'true' but if they set the whole guild to 'false' (or vice versa) it's a block.
  await botdb.all('SELECT * FROM starboard_policies WHERE author = ? AND allow_starboard = ? AND (snowflake = ? OR snowflake = ?)',
    getAuthorAccount(message), false, message.channel.id, message.guild.id)
    .then(result => {
      if (!result) { return; }
      result.forEach(i => {
        switch (i.type) {
        case 'channel':
        case 'guildall':
          isBlocked = true;
          break;
        case 'guildpublic':
          if(!config.starboardPrivateChannels.includes(message.channel.id)) {isBlocked = true;}
          break;
        case 'guildprivate':
          if(config.starboardPrivateChannels.includes(message.channel.id)) {isBlocked = true;}
          break;
        }
      });
    });
  return isBlocked;
}

/*
policy options are: 'true' (allow direct to starboard posting)
'ask' (DM the user requesting permission to post a message)
'false' (item not permitted to go to starboard)
*/
async function policyCheck(message, botdb) {
  await message.pkQuery();
  // initialize the effective policy to true (post is starrable and does not need an ask)
  let effectivePolicy = true;
  // get an arr of policy objects; check for guild, channel, and msg level objects to parse through.
  const policyArr = await botdb.all('SELECT * FROM starboard_policies WHERE author = ? AND (snowflake = ? OR (snowflake = ? AND (type = ? OR type = ?)))',
    getAuthorAccount(message), message.channel.id, message.guild.id, 'guildall', getPublicPrivate(message.channel)) || [];
  // check if message is in the messages policy list and append to policyArr
  await botdb.get('SELECT * FROM starboard_message_policies WHERE original_msg = ?', message.id).then(
    result => {
      if (result) {
        policyArr.push(result);
      }
    });
  // if there is no custom policy for this user and channel, AND the channel is listed in the private channels, return "ask"
  if (policyArr.length == 0 && config.starboardPrivateChannels.includes(message.channel.id)) {
    return 'ask';
  }
  // a single user-set policy always trumps the privchannels list so no need to check it again
  else if (policyArr.length == 1) {
    return policyArr[0].allow_starboard;
  }
  else {
    // 'ask' policies always trump 'true' policy. false policy always trumps any other policy.
    policyArr.forEach(i => {
      if (i.allow_starboard == false && effectivePolicy != false) { effectivePolicy = false; }
      else if (i.allow_starboard == 'ask' && effectivePolicy == true) { effectivePolicy = 'ask'; }
      else { effectivePolicy = true; }
    });
  }
  return effectivePolicy;
}

// Force is an optional variable to bypass the starboard policy check.
async function publicOnStar(message, botdb, force = false) {
  if (!config.starboardChannelId || !config.starboardToggle || config.starboardIgnoreChannels.includes(message.channel.id)) return;
  // initialize PK data for message.
  await message.pkQuery();
  // check if user or message are on the blocklist
  if(await blockCheck(message, botdb)) return;
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
    catch (error) {
      // edge case where e.g. original has been deleted, but retained in the starboard.
      // this will eliminate the item from the starboard table and the starboard message will stop being updated.
      const messageRegEx = /(?:(?:https*:\/\/)*.*discord.*\/channels\/)\d+\/(\d+)\/(\d+)/;
      const urlfield = message.embeds[0].fields.find(field => {
        return field.name == 'Source';
      });
      const target = { chanID: messageRegEx.exec(urlfield.value)[1], msgID: messageRegEx.exec(urlfield.value)[2] };
      await botdb.run('DELETE FROM starboard WHERE original_msg = ?', target.msgID);
      await botdb.run('DELETE FROM starboard_stars WHERE original_msg = ?', target.msgID);
      return;
    }
  }
  // ...otherwise we can just search by the original id
  else {
    dbdata = await queryByOriginal(message.id, botdb);
  }
  if (dbdata) {
    // item is already in star db; starboard message should exist. Skip policy-check and simply get starboard message.
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
      await botdb.run('DELETE FROM starboard_stars WHERE original_msg = ?', message.id);
    }
  }
  else if (!dbdata) {
    const usrArr = await retrieveStarGivers(message);
    const starcount = usrArr.length;
    let msgPolicy;
    if (force === true) { msgPolicy = true; }
    else { msgPolicy = await policyCheck(message, botdb); }
    // console.log('policy = ' + msgPolicy);
    // if item's policy is false or the item is not in db and has fewer stars than threshold, do nothing.
    if (!msgPolicy
      || (!dbdata && (starcount < config.starThreshold))
    ) { return; }
    else if (starcount >= config.starThreshold && msgPolicy == true) {
      // item is new starboard candidate. generate embed and message
      const starboardEmbed = await generateEmbed(message, starcount, config.starThreshold);
      const starboardEmoji = generateEmoji(starcount, config.starThreshold);
      const starboardMsg = await starboardChannel.send(`${starboardEmoji} **${starcount}** ${message.channel}`, starboardEmbed);
      // update starboard_stars table and starboard table
      await starsGivenUpdater(message, usrArr, botdb);
      return await botdb.run('INSERT INTO starboard(original_msg,starboard_msg,channel,author,starthreshold) VALUES(?,?,?,?,?)',
        message.id, starboardMsg.id, message.channel.id, getAuthorAccount(message), config.starThreshold);
    }
    else if (starcount >= config.starThreshold && msgPolicy == 'ask') {
      // starboard_limbo - Columns: author channel original_msg dm_id
      // check if item is already in starboard limbo and a DM was sent.
      const inLimbo = await botdb.get('SELECT * FROM starboard_limbo WHERE original_msg = ?', message.id);
      if (!inLimbo) {
        const DM = await message.author.send(`
"Hey! your post at ${message.url} got ${starcount} stars and is eligible for the starboard! Since it is in a private channel, I need your affirmation to put it on the starboard.
React to this post with one of the following:
- :white_check_mark: to **permit** this single post to go to the starboard.
- :ok: to **permit** all of your posts in **#${message.channel.name}** to be starboarded indefinitely.
- :cool: to **permit** all of your posts in *all* **private** channels on ${message.guild.name} to be starboarded indefinitely.
- :x: to **block** all of your posts in **#${message.channel.name}** from being starboarded.
- :no_entry: to **block** all of your posts in *all* **private** channels on ${message.guild.name} from being starboarded indefinitely.
- :no_entry_sign: to **block** all your posts in **all** channels on ${message.guild.name} from the starboard. (your extant starboard posts will not be removed, but staff can remove them for you.)
*This DM will not be repeated for this individual post. If you don't react, the post will not go to the starboard.*
The .starboard command can be also be used in server to access these functionalities."`);
        // add DM data to limbo table.
        return await botdb.run('INSERT INTO starboard_limbo(author, channel, original_msg, dm_id) VALUES(?,?,?,?)',
          getAuthorAccount(message), message.channel.id, message.id, DM.id);
      }
      else { return; }
    }
  }
}

async function publicBlockUser(user, guild, botdb) {
  // exempting/blocking users from starboard is easy since we don't need to go back and delete old starboard items from them.
  let alreadyBlocked = false;
  try {
    // first, delete all entries for this guild in the policies table that DON'T have an allow_starboard = false policy set.
    await botdb.run('DELETE FROM starboard_policies WHERE author = ? AND snowflake = ? AND (type != ? OR allow_starboard != ?)',
      user.id, guild.id, 'guildall', false);
    await botdb.run('INSERT OR IGNORE INTO starboard_policies(author, snowflake, type, allow_starboard) VALUES(?,?,?)',
      user.id, guild.id, 'guildall', false).then(
      result => { if(result.changes == 0) {alreadyBlocked = true;}});
    if (alreadyBlocked) { return 'alreadyblocked'; }
    else {
      // clean up db - prune extraneous channel settings
      await botdb.all('SELECT * FROM starboard_policies WHERE author = ? AND type = ?', user.id, 'channel').then(
        async result => {
          result.forEach(
            async i => {
              const c = await guild.client.channels.fetch(i.channel);
              if (c.guild.id == guild.id) {
                await botdb.run('DELETE FROM starboard_policies WHERE author = ? and snowflake = ?',
                  user.id, c.id);
              }
            },
          );
        });
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
    await message.pkQuery();
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
      // using a conditional because this function will be called automatically when a starboard message is deleted by staff.
      // TODO: make sure this function is called automatically!
      if (starboardMsg) { starboardMsg.delete(); }
      await botdb.run('DELETE FROM starboard WHERE original_msg = ?', message.id);
      await botdb.run('DELETE FROM starboard_stars WHERE original_msg = ?', message.id);
    }
    await botdb.run('INSERT OR IGNORE INTO starboard_message_policies(original_msg, author, channel, allow_starboard) VALUES(?,?,?,?)', message.id, getAuthorAccount(message), message.channel.id, false).then(result => {
      if(result.changes == 0) {alreadyBlocked = true;}
    });
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

async function publicUnblockUser(user, guild, botdb) {
  let notBlocked = false;
  try {
    await botdb.run('DELETE FROM starboard_policies WHERE author = ? AND snowflake = ? AND type = ? AND allow_starboard = ?',
      user.id, guild.id, 'guildall', false).then(result => {
      if(result.changes == 0) {notBlocked = true;}
    });
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
    await botdb.run('DELETE FROM starboard_message_policies WHERE original_msg = ?', message.id)
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

async function publicChanPolicyChange(message, channel, change, botdb) {
  await message.pkQuery();
  let changePolicy;
  // delete any old policy entry.
  await botdb.run('DELETE FROM starboard_policies WHERE author = ? AND snowflake = ?', getAuthorAccount(message), channel.id);
  switch (change) {
  case 'allow':
    changePolicy = true;
    break;
  case 'block':
    changePolicy = false;
    break;
  case 'ask':
    changePolicy = 'ask';
    break;
  case 'reset':
  default:
    // return since we're not adding new policy.
    return;
  }
  await botdb.run('INSERT INTO starboard_policies(author,snowflake,type,allow_starboard) VALUES(?,?,?,?)', getAuthorAccount(message), channel.id, 'channel', changePolicy);
}

async function publicServPolicyChange(message, change, usrScope, botdb) {
  await message.pkQuery();
  let changePolicy;
  let type;
  if (usrScope == 'server') {
    // delete any old policy entry for the whole guild, including channels in the guild.
    type = 'guildall';
    await botdb.run('DELETE FROM starboard_policies WHERE author = ? AND snowflake = ?', getAuthorAccount(message), message.guild.id);
    await botdb.all('SELECT * FROM starboard_policies WHERE author = ? AND type = ?', getAuthorAccount(message), 'channel').then(
      channels => {
        channels.forEach(
          async d => {
            const cData = await message.client.channels.fetch(d.snowflake);
            if (cData.guild.id == message.guild.id) { await botdb.run('DELETE FROM starboard_policies WHERE author = ? AND snowflake = ?', getAuthorAccount(message), d.snowflake);}
          },
        );
      },
    );
  }
  else if (usrScope == 'public' || usrScope == 'private') {
    // delete any old policy entry for the scope, including channels in this scope.
    type = 'guild' + usrScope;
    await botdb.run('DELETE FROM starboard_policies WHERE author = ? AND snowflake = ? AND type = ?', getAuthorAccount(message), message.guild.id, type);
    await botdb.all('SELECT * FROM starboard_policies WHERE author = ? AND type = ?', getAuthorAccount(message), 'channel').then(
      channels => {
        channels.forEach(
          async d => {
            const c = await message.client.channels.fetch(d.snowflake);
            // if channel is from the same guild as the message, AND its type matches the scope:
            if (c.guild.id == message.guild.id && type == getPublicPrivate(c)) {
              await botdb.run('DELETE FROM starboard_policies WHERE author = ? AND snowflake = ?', getAuthorAccount(message), d.snowflake);
            }
          },
        );
      },
    );
  }
  switch (change) {
  case 'allow':
    changePolicy = true;
    break;
  case 'block':
    changePolicy = false;
    break;
  case 'ask':
    changePolicy = 'ask';
    break;
  case 'reset':
  default:
    // return since we're not adding new policy.
    return;
  }
  await botdb.run('INSERT INTO starboard_policies(author,snowflake,type,allow_starboard) VALUES(?,?,?,?)', getAuthorAccount(message), message.guild.id, type, changePolicy);
}

async function publicMigrator(fromChannel, toChannel, replyChannel, botdb) {
  await prepTables(botdb);
  // create a temporary migrator db to integrate extant starboard with migrated; this is a copy of the old starboard.
  await botdb.run('CREATE TABLE IF NOT EXISTS starmigrator (original_msg text NOT NULL UNIQUE, starboard_msg text NOT NULL UNIQUE, channel text NOT NULL, author text NOT NULL, starthreshold integer NOT NULL, PRIMARY KEY(original_msg, starboard_msg))');
  await botdb.run('INSERT INTO starmigrator SELECT * FROM starboard');
  await botdb.run('ALTER TABLE starmigrator RENAME COLUMN starboard_msg TO old_starboard_msg');
  await botdb.run(`ALTER TABLE starmigrator ADD COLUMN old_starboard_channel text NOT NULL DEFAULT ${config.starboardChannelId}`);
  await botdb.run('CREATE TABLE IF NOT EXISTS starboard_starsmigrator (original_msg text NOT NULL, stargiver text NOT NULL, UNIQUE(original_msg, stargiver))');
  // create a temporary blank starboard table to push data into. This will be renamed to replace starboard at the end of this process.
  await botdb.run('CREATE TABLE IF NOT EXISTS newstarboard (original_msg text NOT NULL UNIQUE, starboard_msg text NOT NULL UNIQUE, channel text NOT NULL, author text NOT NULL, starthreshold integer NOT NULL, PRIMARY KEY(original_msg, starboard_msg)) ');
  let lastSeenMessage = 0;
  let loopbreaker = 0;
  let prevLastSeen;
  while (fromChannel.lastMessageID != lastSeenMessage && loopbreaker < 2) {
    prevLastSeen = lastSeenMessage;
    await fromChannel.messages.fetch({ limit: 100, after: lastSeenMessage }).then(async messagearr => {
      for (const oldStarboardMsg of messagearr.values()) {
        if (oldStarboardMsg.embeds[0]) {
          let targetmsg = undefined;
          const urlfield = await oldStarboardMsg.embeds[0].fields.find(field => {
            return field.name == 'Source';
          });
          if (urlfield && urlfield.value) {targetmsg = await getMessageFromURL(urlfield.value, fromChannel.client);}
          if (targetmsg) {
            await targetmsg.pkQuery();
            let starThreshold;
            const usrArr = await retrieveStarGivers(targetmsg, oldStarboardMsg);
            // to account for possible differences in star threshold over time, we will assume that any message OVER the current threshold uses the current threshold...
            if (config.starThreshold && usrArr.length >= config.starThreshold) {
              starThreshold = config.starThreshold;
            }
            // ...but any message that doesn't meet that criteria is legacied in with its threshold set to its current star count.
            else { starThreshold = usrArr.length; }
            // add it all to the migrator table and migrator star table.
            await botdb.run('INSERT OR IGNORE INTO starmigrator(original_msg,old_starboard_msg,channel,author,starthreshold,old_starboard_channel) VALUES(?,?,?,?,?,?)',
              targetmsg.id, oldStarboardMsg.id, targetmsg.channel.id, getAuthorAccount(targetmsg), starThreshold, oldStarboardMsg.channel.id);
            for (const usr of usrArr) {
              await botdb.run('INSERT OR IGNORE INTO starboard_starsmigrator(original_msg, stargiver) VALUES(?,?)', targetmsg.id, usr);
            }
          }
          else { replyChannel.send(`Message or channel deleted for starboard item at <${oldStarboardMsg.url}> - Skipping this item.`); }
          // finally if the message id is larger than the oldest one we've seen, update our lastseen.
          if (targetmsg && BigInt(targetmsg.id) > BigInt(lastSeenMessage)) { lastSeenMessage = targetmsg.id; }
        }
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
    const oldstarboardMsg = await oldstarboardChannel.messages.fetch(dbdata.starboard_msg);
    const usrArr = await retrieveStarGivers(originalMsg, oldstarboardMsg);
    const starcount = usrArr.length;
    // checking if starcount is greater than 0; edge case relating to
    if (starcount >= dbdata.starthreshold && starcount > 0) {
      const starboardEmbed = await generateEmbed(originalMsg, starcount, dbdata.starthreshold);
      const starboardEmoji = generateEmoji(starcount, dbdata.starthreshold);
      const newStarboardMsg = await toChannel.send(`${starboardEmoji} **${starcount}** ${originalChannel}`, starboardEmbed);
      const starArr = await botdb.all('SELECT stargiver FROM starboard_starsmigrator WHERE original_msg = ?', originalMsg.id);
      for (const { stargiver } of starArr) {
      // for each item of this the array from the migratorstars table, compare to usrArr...
        if (!usrArr.includes(stargiver)) {
        // if usrArr passed to this function does not contain a migratorstars item, that must mean the user has removed their star.
          await botdb.run('DELETE FROM starboard_starsmigrator WHERE original_msg = ? AND stargiver = ?', originalMsg.id, stargiver);
        }
        else {
        // else if usrarr DOES contain the item, discard it.
          usrArr.splice(usrArr.indexOf(stargiver), 1);
        }
      }
      if (usrArr.length > 0) {
      // remaining items in usrArr do not exist in migratorstars table. attempt to insert into starboard_stars.
        for (const usr of usrArr) {
          await botdb.run('INSERT OR IGNORE INTO starboard_starsmigrator(original_msg, stargiver) VALUES(?,?)', originalMsg.id, usr);
        }
      }
      await botdb.run('INSERT INTO newstarboard(original_msg,starboard_msg,channel,author,starthreshold) VALUES(?,?,?,?,?)',
        originalMsg.id, newStarboardMsg.id, originalMsg.channel.id, getAuthorAccount(originalMsg), config.starThreshold);
    }
  }
  await botdb.run('DROP TABLE IF EXISTS starboard');
  await botdb.run('DROP TABLE IF EXISTS starboard_stars');
  await botdb.run('ALTER TABLE newstarboard RENAME TO starboard');
  await botdb.run('ALTER TABLE starboard_starsmigrator RENAME TO starboard_stars');
  await botdb.run('CREATE INDEX IF NOT EXISTS idx_starsgiven_originals ON starboard_stars(original_msg)');
  await botdb.run('CREATE INDEX IF NOT EXISTS idx_stargiver ON starboard_stars(stargiver)');
  await botdb.run('DROP TABLE IF EXISTS starmigrator');
}

async function publicOnDMReact(message, emoji, botdb) {
  const limboEntry = await botdb.get('SELECT * FROM starboard_limbo WHERE dm_id = ?', message.id);
  if (!limboEntry) { return; }
  const original_msg = await message.client.channels.fetch(limboEntry.channel).then(async c => {
    const m = await c.messages.fetch(limboEntry.original_msg);
    return m;
  });
  switch (emoji) {
  case '✅': {
    await botdb.run('INSERT OR IGNORE INTO starboard_message_policies(original_msg,author,channel,allow_starboard) VALUES(?,?,?,?)', limboEntry.original_msg, limboEntry.author, limboEntry.channel, true);
    await botdb.run('DELETE FROM starboard_limbo WHERE dm_id = ?', message.id);
    return await publicOnStar(original_msg, botdb);
  }
  case '🆗': {
    // add individual channel to starboard_policies with allow_starboard = true
    await botdb.run('INSERT OR IGNORE INTO starboard_policies(author,snowflake,type,allow_starboard) VALUES(?,?,?,?)', limboEntry.author, limboEntry.channel, 'channel', true);
    await botdb.run('DELETE FROM starboard_limbo WHERE dm_id = ?', message.id);
    // then re-run OnStar to add message to starboard
    return await publicOnStar(original_msg, botdb);
  }
  case '🆒': {
    // add all private channels to starboard_policies with allow_starboard = true
    await botdb.run('INSERT OR IGNORE INTO starboard_policies(author,snowflake,type,allow_starboard) VALUES(?,?,?,?)', limboEntry.author, original_msg.guild.id, 'guildprivate', true);
    await botdb.run('DELETE FROM starboard_limbo WHERE dm_id = ?', message.id);
    // then re-run OnStar to add message to starboard
    return await publicOnStar(original_msg, botdb);
  }
  case '❌': {
    return publicBlockMsg(original_msg, botdb);
  }
  case '⛔': {
    // add individual channel to starboard_policies with allow_starboard = false
    await botdb.run('INSERT OR IGNORE INTO starboard_policies(author,snowflake,type,allow_starboard) VALUES(?,?,?,?)', limboEntry.author, limboEntry.channel, 'channel', false);
    await botdb.run('DELETE FROM starboard_limbo WHERE dm_id = ?', message.id);
    return;
  }
  case '🚫': {
    // add all private channels to starboard_policies with allow_starboard = false
    await botdb.run('INSERT OR IGNORE INTO starboard_policies(author,snowflake,type,allow_starboard) VALUES(?,?,?,?)', limboEntry.author, original_msg.guild.id, 'guildprivate', false);
    await botdb.run('DELETE FROM starboard_limbo WHERE dm_id = ?', message.id);
    return;
  }
  default :
    return;
  }
}

module.exports = {
  onReady: publicOnReady,
  onStar: publicOnStar,
  blockUser: publicBlockUser,
  blockMsg: publicBlockMsg,
  unblockUser: publicUnblockUser,
  unblockMsg: publicUnblockMessage,
  migrator: publicMigrator,
  onDMReact: publicOnDMReact,
  chanPolicyChange: publicChanPolicyChange,
  servPolicyChange: publicServPolicyChange,
};