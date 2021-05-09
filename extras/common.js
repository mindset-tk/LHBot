const path = require('path');
const configPath = path.resolve('./config.json');
const config = require(configPath);
const Discord = require('discord.js');

// function to determine if a user's permission level - returns null, 'comrade', or 'staff'
function getPermLevel(message) {
    if (message.channel instanceof Discord.DMChannel) return null;

    if (message.isPKMessage) {
        if (message.PKData.author.roles.cache.has(config.roleStaff)) {
            return 'staff';
        }
        else if (message.PKData.author.roles.cache.has(config.roleComrade)) {
            return 'comrade';
        }
        else {return null;}
    }
    else if (!message.isPKMessage) {
        if (message.member.roles.cache.has(config.roleStaff)) {
            return 'staff';
        }
        else if (message.member.roles.cache.has(config.roleComrade)) {
            return 'comrade';
        }
        else {return null;}
    }
    return null;
}

module.exports = {
    getPermLevel,
};