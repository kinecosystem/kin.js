import "source-map-support/register";
import { KinNetwork } from "./networks";
import { create as createWallet, Keypair } from "./client";

const publicKey = "GDFID4LXSWH5Y5QRV2CB26SE4KL24QYEBSVDQFCADCD2PCDA5IDNNZFL";
const secretKey = "SBJQWLNJR2BHHMHG2ZZIVZ6D4PFCYUMRZXOBXO6TROHVD7W4XJXO5UWQ";

const keys = Keypair.fromSecret(secretKey);
const network = KinNetwork.from(
	"Kin Testnet ; December 2018",
	"https://horizon-testnet.kininfrastructure.com");

createWallet(network, keys).then(wallet => {
	console.log(wallet.balance.cached);
	console.log(wallet);
	console.log("=================================");
	wallet.onPaymentReceived(console.log);
});
