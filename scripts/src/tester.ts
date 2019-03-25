import "source-map-support/register";
import { KinNetwork } from "./networks";
import { create as createWallet, Keypair, KinWallet } from "./client";

const publicKey = "GDFID4LXSWH5Y5QRV2CB26SE4KL24QYEBSVDQFCADCD2PCDA5IDNNZFL";
const secretKey = "SBJQWLNJR2BHHMHG2ZZIVZ6D4PFCYUMRZXOBXO6TROHVD7W4XJXO5UWQ";

const keys = Keypair.fromSecret(secretKey);
const network = KinNetwork.from(
	"Kin Testnet ; December 2018",
	"https://horizon-testnet.kininfrastructure.com");

createWallet(network, keys).then(async wallet => {
	await testWallet(wallet);
});

async function testWallet(wallet: KinWallet) {
	const transactionXdr3 = await wallet.getTransactionXdr(publicKey, 1);
	console.log("xdr", transactionXdr3);

	console.log(wallet.balance.cached);
	console.log(wallet.toString());
	console.log("=================================");

	const memo = ("some_memo" + Math.random()).substr(0, 28);

	console.log("sending memo", memo);

	wallet.onPaymentReceived((payment, stream) => {
		if (payment.memo === memo) {
			stream.stop();
			console.log("called stop");
		}
		console.log(`Got payment ${ payment.id } from ${ payment.sender } of ${ payment.amount } with memo ${ payment.memo }`);
	});

	const payment = await wallet.pay(publicKey, 1, { memo, fee: 100 });
	console.log(`Sent payment to ${ payment.recipient } of ${ payment.amount } with memo ${ payment.memo }`);
	console.log("new balance: ", await wallet.balance.update());
	console.log(wallet.toString());

	const transactionXdr = await wallet.getTransactionXdr(publicKey, 1, { memo, fee: 100 });
	console.log("xdr", transactionXdr);
}
