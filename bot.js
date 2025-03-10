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
🔸 /status - Check status of your wallet addresses`,
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

	function getTimeDifference(transactionTimestamp) {
		const now = new Date();
		const currentUnixTimestamp = now.getTime() / 1000;

		const transactionUnixTimestamp = transactionTimestamp;

		const timeDiff =
			(currentUnixTimestamp - transactionUnixTimestamp) / 3600;
		return timeDiff;
	}

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

		statuses.push({
			address: address,
			status: status,
		});
	}

	console.log(statuses);

	const formattedResponse = statuses
		.map(
			(status) =>
				`<b>${status.address}</b>\nStatus: ${status.status} \nEtherscan: <a href="https://sepolia.etherscan.io/address/${status.address}">View on Etherscan</a>`
		)
		.join("\n\n");

	const header = "<b>🔍 WALLET STATUS REPORT 🔍</b>\n\n";
	return header + (formattedResponse || "No wallet addresses configured");
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
