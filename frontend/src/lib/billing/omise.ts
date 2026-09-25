// Omise.js pre-built payment form (OmiseCard). The card number goes straight from the
// Omise iframe to Omise; we only ever see the one-time token (tokn_...) it hands back,
// which the backend turns into a customer + charge (backend app/billing/omise.py).
const OMISE_JS_URL = 'https://cdn.omise.co/omise.js';

interface OmiseCardApi {
	configure(config: { publicKey: string }): void;
	open(options: {
		amount: number;
		currency: string;
		defaultPaymentMethod: 'credit_card';
		otherPaymentMethods: string[];
		frameLabel: string;
		submitLabel: string;
		locale: string;
		onCreateTokenSuccess: (nonce: string) => void;
		onFormClosed: () => void;
	}): void;
}

declare global {
	interface Window {
		OmiseCard?: OmiseCardApi;
	}
}

let loading: Promise<OmiseCardApi> | null = null;

function loadOmiseCard(): Promise<OmiseCardApi> {
	if (window.OmiseCard) return Promise.resolve(window.OmiseCard);
	loading ??= new Promise((resolve, reject) => {
		const script = document.createElement('script');
		script.src = OMISE_JS_URL;
		script.onload = () =>
			window.OmiseCard ? resolve(window.OmiseCard) : reject(new Error('OmiseCard missing'));
		script.onerror = () => {
			loading = null;
			reject(new Error('Could not load omise.js'));
		};
		document.head.append(script);
	});
	return loading;
}

/** Opens the Omise card form; resolves to a card token, or null if the user closed it. */
export async function collectCardToken(
	publicKey: string,
	amountSatang: number,
	currency: string,
	label: string
): Promise<string | null> {
	const omiseCard = await loadOmiseCard();
	omiseCard.configure({ publicKey });
	return new Promise((resolve) => {
		let settled = false;
		omiseCard.open({
			amount: amountSatang,
			currency: currency.toUpperCase(),
			defaultPaymentMethod: 'credit_card',
			// Recurring charges need a saved card, so other methods (PromptPay...) are hidden.
			otherPaymentMethods: [],
			frameLabel: 'Cyberpump',
			submitLabel: label,
			locale: 'th',
			onCreateTokenSuccess: (nonce) => {
				settled = true;
				resolve(nonce.startsWith('tokn_') ? nonce : null);
			},
			onFormClosed: () => {
				if (!settled) resolve(null);
			}
		});
	});
}
