import * as KinSDK from "@kinecosystem/kin-sdk";

export class KinNetwork {
	public static getProduction() {
		return new KinNetwork(
			KinSDK.Networks.PUBLIC,
			"https://horizon.kinfederation.com"
		);
	}

	public static getTestnet() {
		return new KinNetwork(
			KinSDK.Networks.TESTNET,
			"https://horizon-testnet.kininfrastructure.com"
		);
	}

	public static from(passphrase: string, horizon: string) {
		return new KinNetwork(passphrase, horizon);
	}

	public readonly server!: KinSDK.Server;

	private constructor(passphrase: string, horizonUrl: string) {
		KinSDK.Network.use(new KinSDK.Network(passphrase));
		this.server = new KinSDK.Server(horizonUrl);
	}
}
