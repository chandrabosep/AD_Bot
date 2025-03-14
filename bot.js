const TelegramBot = require("node-telegram-bot-api");
require("dotenv").config();

const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
const chatId = process.env.TELEGRAM_CHAT_ID ?? "";

const bot = new TelegramBot(token, { polling: true });

bot.onText(/\/(start|help)/, (msg) => {
	const chatId = msg.chat.id;
	bot.sendMessage(
		chatId,
		`<b>Hello ${msg.from.first_name || "Boss"},</b>

<b>Available commands:</b>
🔸 /start - Start the bot
🔸 /status - Check status of your wallet addresses
🔸 /checkpoints - Get all checkpoints of your wallet addresses
`,
		{ parse_mode: "HTML" }
	);
});

bot.onText(/\/status/, async (msg) => {
	const chatId = msg.chat.id;
	console.log(chatId);
	bot.sendMessage(chatId, await checkWalletStatuses(), {
		parse_mode: "HTML",
	});
});

async function checkWalletStatuses() {
	const addresses = process.env.ADDRESSES;

	if (!addresses) {
		console.error("ADDRESSES is not defined or is empty in .env");
		return "No wallet addresses configured";
	}

	let parsedAddresses;
	try {
		parsedAddresses = JSON.parse(addresses);
	} catch (error) {
		console.error("Error parsing ADDRESSES:", error);
		return "Invalid wallet addresses format";
	}

	const statuses = [];

	for (const [index, address] of parsedAddresses.entries()) {
		const url = `https://api-sepolia.etherscan.io/api?module=account&action=txlist&address=${address}&page=1&offset=1&sort=desc&apikey=${process.env.ETHERSCAN_API_KEY}`;

		let data;
		try {
			await new Promise((resolve) => setTimeout(resolve, 1000));

			const response = await fetch(url);
			data = await response.json();
		} catch (error) {
			console.error("Error fetching data:", error);
			statuses.push({
				address: address,
				status: "❌ Error",
			});
			continue;
		}

		const transactions = data.result || [];
		let status = "❌ Disconnected";
		if (transactions.length > 0) {
			const lastTransactionTime = parseInt(transactions[0].timeStamp);

			const timeDiff = getTimeDifference(lastTransactionTime);

			console.log(`Time Difference: ${timeDiff} hours`);

			if (timeDiff <= 1.2) {
				status = "✅ Active";
			}
		}

		const lastCheckpointTime = getTimeDifference(transactions[0].timeStamp);
		const lastCheckpointReadable =
			lastCheckpointTime < 5 / 60
				? "less than a minute"
				: lastCheckpointTime < 24
				? `${(lastCheckpointTime * 60).toFixed(0)} minutes`
				: `${(lastCheckpointTime / 24).toFixed(2)} days`;

		statuses.push({
			address: address,
			status: status,
			lastCheckpoint: lastCheckpointReadable,
		});
	}

	console.log(statuses);

	const formattedResponse = statuses
		.map(
			(status) =>
				`<b>${statuses.indexOf(status) + 1}. ${
					status.address
				}</b>\nStatus: ${status.status}\nLast Checkpoint: ${
					status.lastCheckpoint
				} ago\nEtherscan: <a href="https://sepolia.etherscan.io/address/${
					status.address
				}">Etherscan</a> `
		)
		.join("\n\n");

	const header = "<b>🔍 WALLET STATUS REPORT 🔍</b>\n\n";
	return header + (formattedResponse || "No wallet addresses configured");
}

bot.onText(/\/checkpoints/, async (msg) => {
	const chatId = msg.chat.id;
	bot.sendMessage(chatId, await getCheckpoints(), {
		parse_mode: "HTML",
	});
});

async function getCheckpoints() {
	const addresses = process.env.ADDRESSES;

	if (!addresses) {
		console.error("ADDRESSES is not defined or is empty in .env");
		return "No wallet addresses configured";
	}

	let parsedAddresses;
	try {
		parsedAddresses = JSON.parse(addresses);
	} catch (error) {
		console.error("Error parsing ADDRESSES:", error);
		return "Invalid wallet addresses format";
	}

	const checkpoints = [];

	for (const address of parsedAddresses) {
		const url = `https://api-sepolia.etherscan.io/api?module=account&action=txlist&address=${address}&page=1&offset=2000&startblock=7852278&sort=desc&apikey=${process.env.ETHERSCAN_API_KEY}`;

		let data;
		try {
			await new Promise((resolve) => setTimeout(resolve, 1000));

			const response = await fetch(url);
			data = await response.json();
		} catch (error) {
			console.error("Error fetching data:", error);
			continue;
		}

		const totalCheckpoints = data.result.length;
		const lastCheckpointTimestamp = data.result[0].timeStamp;
		const lastCheckpointTime = getTimeDifference(lastCheckpointTimestamp);
		const lastCheckpointReadable =
			lastCheckpointTime < 5 / 60
				? "less than a minute"
				: lastCheckpointTime < 24
				? `${(lastCheckpointTime * 60).toFixed(0)} minutes`
				: `${(lastCheckpointTime / 24).toFixed(2)} days`;

		checkpoints.push({
			address,
			checkpoints: totalCheckpoints,
			lastCheckpoint: {
				time: lastCheckpointReadable,
			},
		});
	}

	const formattedResponse = checkpoints
		.map((checkpoint, index) => {
			const {
				address,
				lastCheckpoint,
				checkpoints: totalCheckpoints,
			} = checkpoint;
			return `<b>${index + 1}. ${address}</b>\nLast Recorded: ${
				lastCheckpoint.time
			} ago\nCheckpoints: ${totalCheckpoints}`;
		})
		.join("\n\n");

	const header = "<b>🔍 CHECKPOINTS REPORT 🔍</b>\n\n";
	return header + (formattedResponse || "No wallet addresses configured");
}

function getTimeDifference(transactionTimestamp) {
	const now = new Date();
	const currentUnixTimestamp = now.getTime() / 1000;

	const transactionUnixTimestamp = transactionTimestamp;

	const timeDiff = (currentUnixTimestamp - transactionUnixTimestamp) / 3600;
	return timeDiff;
}

setInterval(async () => {
	try {
		const message = await checkWalletStatuses();
		if (chatId) {
			bot.sendMessage(chatId, message, { parse_mode: "HTML" });
		} else {
			console.error("No chat ID set to send messages.");
		}
	} catch (error) {
		console.error("Error sending hourly update:", error);
	}
}, 3600000);
