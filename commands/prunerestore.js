const fs = require('fs');
const path = require('path');
const configPath = path.resolve('./config.json');
const config = require(configPath);
const pruneStoragePath = path.resolve('./prunestorage.json');
pruneStorage = require(pruneStoragePath);

module.exports = {
  name: 'prunerestore',
  description: 'DMs an xls of user activity to the user',
  usage: '',
  cooldown: 0,
  guildOnly: true,
  staffOnly: true,
  args: false,
  async execute(message, args, client) {
    //todo: delete the user out of prunestorage once roles are restored
    
    
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

    // save disk space and increase readability
    function prettyPrintJson() {
      const output = JSON.stringify(pruneStorage, function(k, v) {
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
      fs.writeFile(pruneStoragePath, prettyPrintJson(), function(err) {
        if (err) {
          return console.log(err);
        }
      });
    }

    async function getUser(ID) {
      if (ID.startsWith('<@!') && ID.endsWith('>')) {
        ID = ID.slice(3, -1);
        return await message.guild.member(ID);
      }
      else {
        try { return await message.guild.member(ID);}
        catch { return null;}
      }
    }

    //change maxTimeSinceActive for live, probably configurable as a default max prune time
    //Pull the args so we know what we're working with
    switch (args.length) {
      case 1:
        //todo: allow passing more than one user at once! probably comma delimited? check for 'all'
        break;
      case 0:
        //todo: offer to restore all users later
        return message.channel.send("specify a user pls :3");
    }
    
    //Set the name of the role/channel to be used for prunes. Probably will go in a config soon?
    const pruneTitle = "prune-limbo";

/*
    if (message.guild.roles.cache.find(role => role.name === pruneTitle) || message.guild.channels.cache.find(role => role.name === pruneTitle)) {
      return message.channel.send("It looks like there was already a prune in process. You should finish that out first using `.prunekick confirm` or `.prunekick abandon`");
    }
*/
    const member = await getUser(args[0]);
    //const usrObj = memberObj.user;
    //restore roles for now, delete channel, etc
    await member.roles.set(pruneStorage[member.user.id], 'Restoring user roles');
/*
    await channel.delete('Post-prune cleanup');
    await pruneRole.delete('Post-prune cleanup');
*/
  
  //writeData();
  message.channel.send("Okay, " + member.user.tag + " has been released from prune limbo");
/*        })
        .catch (e => {
          console.log('Error creating prune channel:', e);
          return message.channel.send('There was an error creating the prune channel, contact the bot owner.');
        });
*/
    }
  };
