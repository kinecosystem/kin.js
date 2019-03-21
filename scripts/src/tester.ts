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
	console.log(wallet.balance.cached);
	console.log(wallet.toString());
	console.log("=================================");
	wallet.onPaymentReceived(p =>
		console.log(`Got payment from ${ p.sender } of ${ p.amount } with memo ${ p.memo }`));

	const payment = await wallet.pay(publicKey, 1, "some_memo" + Math.random());
	console.log(`Sent payment to ${ payment.recipient } of ${ payment.amount } with memo ${ payment.memo }`);
	console.log("new balance: ", await wallet.balance.update());

	wallet.onPaymentReceived(p =>
		console.log(`Got payment from ${ p.sender } of ${ p.amount } with memo ${ p.memo }`));
	console.log(wallet.toString());
}
