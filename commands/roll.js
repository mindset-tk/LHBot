module.exports = {
	name: 'roll',
	description: 'Roll dice. You can roll multiple sets of dice by separating them with a space. Decimal numbers, negative numbers, 0, and numbers larger than 1000 are not accepted.',
	cooldown: 5,
	usage: '<#dice>d<#sides> (ex. 2d6)',

	async execute(message, args, client) {

		// check for blank arguments
		if (!args.length) {
			message.channel.send('You need to provide dice to roll!');
			return;
		}

		// get user nickname for reply
		async function getnickname() {
			const user = client.users.get(message.author.id);
			const guild = message.guild;
			const guildmember = guild.member(user);
			return guildmember.nickname;
		}

		const nickname = await getnickname();

		// Check function for inputs. Returns true if input is null, a decimal number, or too big/large
		function dicecheck(num) {
			if (num % 1 != 0) return true;
			else if (isNaN(num)) return true;
			else if (!(num > 0 && num <= 1000)) return true;
			else return false;
		}

		// runs through each argument and attempts to roll dice, then replies with dice info.
		args.forEach(function(dieroll) {
			let totalroll = 0;
			let dice = new Array(2);
			let alldice = new String;
			// parse standard dice notation into an array, then check if input data is valid.
			dice = dieroll.split('d');
			if (!dice.some(dicecheck) && dice[1] != '' && !(dice.length > 2)) {
				const results = new Array;
				// if there's only one die, perform the die roll math more simply and give a shorter output.
				if (dice[0] == '' || dice[0] == 1) {
					results[0] = (Math.floor(Math.random() * dice[1] + 1));
					message.channel.send(nickname + ' rolled a d' + dice[1] + ' and got: ' + results[0] + '.');
				}
				else {
					for (let i = 0; i < dice[0]; i++) {
						results[i] = (Math.floor(Math.random() * dice[1] + 1));
					}
					// total up dice as we go, and formulate clean output string.
					results.forEach(function(roll) {
						totalroll = totalroll + roll;
						alldice = alldice + ' ' + roll + ',';
					});
					// formulate result message and truncate if too long for discord.
					const resultstring = (nickname + ' rolled ' + dieroll + ' and got: ' + totalroll + ' [' + alldice.slice(1, -1) + ']');
					if (resultstring.length < 2000 && dice[1] <= 100) message.channel.send(resultstring);
					else message.channel.send(nickname + ' rolled ' + dieroll + ' and got: ' + totalroll + '. (Too many dice to display individual rolls.)');
				}
			}
			else if (dice[0] > 1000 || dice[1] > 1000) {
				message.channel.send('I\'m sorry, I can\'t roll dice with more than 1000 sides, or more than 1000 dice at a time.');
				return;
			}
			else {
				message.channel.send('Invalid input detected! Proper form would be eith d# to roll a single die, or #d#. Decimals and negative numbers are not accepted.');
				return;
			}
		});
	},
};