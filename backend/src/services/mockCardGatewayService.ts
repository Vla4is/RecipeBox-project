export interface MockCardChargeInput {
  amountCents: number;
  currency: string;
  cardholderName: string;
  cardNumber: string;
  expiryMonth: number;
  expiryYear: number;
  cvc: string;
  billingEmail: string;
}

export interface MockCardChargeResult {
  approved: boolean;
  provider: "MOCKCARD";
  transactionId: string;
  cardBrand: string;
  cardLast4: string;
  declineReason?: string;
}

function detectCardBrand(cardNumber: string): string {
  if (/^4\d{12}(\d{3})?(\d{3})?$/.test(cardNumber)) return "Visa";
  if (/^(5[1-5]\d{14}|2(2[2-9]|[3-6]\d|7[01])\d{12}|2720\d{12})$/.test(cardNumber)) return "Mastercard";
  if (/^3[47]\d{13}$/.test(cardNumber)) return "American Express";
  if (/^6(?:011|5\d{2})\d{12}$/.test(cardNumber)) return "Discover";
  return "Card";
}

function passesLuhn(cardNumber: string): boolean {
  let sum = 0;
  let shouldDouble = false;

  for (let i = cardNumber.length - 1; i >= 0; i -= 1) {
    let digit = Number(cardNumber[i]);
    if (Number.isNaN(digit)) return false;

    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }

    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}

function generateTransactionId(): string {
  return `mock_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function chargeMockCard(input: MockCardChargeInput): Promise<MockCardChargeResult> {
  const sanitizedCardNumber = input.cardNumber.replace(/\s+/g, "");
  const cardLast4 = sanitizedCardNumber.slice(-4);
  const cardBrand = detectCardBrand(sanitizedCardNumber);

  if (!passesLuhn(sanitizedCardNumber)) {
    return {
      approved: false,
      provider: "MOCKCARD",
      transactionId: generateTransactionId(),
      cardBrand,
      cardLast4,
      declineReason: "Card number failed validation.",
    };
  }

  if (sanitizedCardNumber === "4000000000000002") {
    return {
      approved: false,
      provider: "MOCKCARD",
      transactionId: generateTransactionId(),
      cardBrand,
      cardLast4,
      declineReason: "Card was declined by the issuer.",
    };
  }

  if (input.amountCents <= 0) {
    return {
      approved: false,
      provider: "MOCKCARD",
      transactionId: generateTransactionId(),
      cardBrand,
      cardLast4,
      declineReason: "Invalid payment amount.",
    };
  }

  return {
    approved: true,
    provider: "MOCKCARD",
    transactionId: generateTransactionId(),
    cardBrand,
    cardLast4,
  };
}
