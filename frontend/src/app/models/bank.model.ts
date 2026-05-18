export const BANKS = {
  ZIRAAT: 'ZİRAAT',
  PARAF: 'PARAF',
} as const;
export type BankName = typeof BANKS[keyof typeof BANKS];
export type BankFilter = BankName | 'ALL';
