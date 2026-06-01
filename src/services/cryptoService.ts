/**
 * Mock service for real-time crypto price conversion.
 * In a real application, this would call CoinGecko, Binance, or an oracle.
 */

const MOCK_PRICES: Record<string, number> = {
  'INR': 1,
  'BTC': 5500000,
  'ETH': 295000,
};

export const getInrEquivalent = async (amount: number, currency: string): Promise<number> => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 200));

  const price = MOCK_PRICES[currency];
  if (!price) {
    throw new Error(`Unsupported currency: ${currency}`);
  }

  return amount * price;
};
