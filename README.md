# kin.js

A typescript/javascript implementation of the Kin sdk.  
The sdk is meant to run in both node based apps as well as in the browser.

## Current state
This is still a work in progress and is **not** ready for use.  
Currently it's only possible to load an existing funded wallets.

## Client
The sdk offers a client which allows to check for payments (earn and spend transactions) and 
to create new payments.  
The client interface:
```typescript
interface Payment {
	readonly id: string;
	readonly hash: string;
	readonly amount: number;
	readonly sender: string;
	readonly recipient: string;
	readonly timestamp: string;
	readonly memo: string | undefined;
}

type Address = string;
type OnPaymentListener = (payment: Payment) => void;

interface KinWallet {
	getPayments(): Promise<Payment[]>;
	onPaymentReceived(listener: OnPaymentListener): void;
	pay(recipient: Address, amount: number, memo?: string): Promise<Payment>;
}
```

In order to create a wallet:
```typescript
import { KinWallet, createWallet, KinNetwork, Keypair } from "@kinecosystem/kin.js";

async function createKinWallet(): Promise<KinWallet> {
	const keys = Keypair.random();
	const network = KinNetwork.Testnet;
	
	return await createWallet(network, keys);
}
```

Or using promises (without `async/await`):
```typescript
import { KinWallet, createWallet, KinNetwork, Keypair } from "@kinecosystem/kin.js";

const keys = Keypair.random();
const network = KinNetwork.Testnet;
	
let wallet: KinWallet | undefined;
createWallet(network, keys).then(w => wallet = w);
```

For production use the appropriate network:
```typescript
import { KinNetwork } from "@kinecosystem/kin.js";

const network = KinNetwork.Production;
```

Or you can create your own:
```typescript
import { KinNetwork } from "@kinecosystem/kin.js";

const network = KinNetwork.from(
	"network passphrase",
	"asset issuer",
	"horizon url");
```

To get the Kin balance from a wallet:
```typescript
const wallet = getWallet(); // get the wallet somehow
let balance = wallet.balance.cached();
```

Or to get the current balance:
```typescript
let balance = await wallet.balance.update();
```
The `update()` method will also update the `cached` value.
