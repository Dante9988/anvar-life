const bounded = value => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(500000, Math.max(0, number)) : 0;
};

/** Teaching arithmetic only: no underwriting, time-value, suitability or premium model. */
export function coverageExample(needs, existing, savings) {
  needs = bounded(needs);
  existing = bounded(existing);
  savings = bounded(savings);
  const existingApplied = Math.min(needs, existing);
  const savingsApplied = Math.min(Math.max(0, needs - existingApplied), savings);
  return {
    needs, existing, savings,
    gap: Math.max(0, needs - existing - savings),
    existingPercent: needs === 0 ? 0 : existingApplied / needs * 100,
    savingsPercent: needs === 0 ? 0 : savingsApplied / needs * 100
  };
}

/** Invented single-period rules: 8% cap, 0% floor, 100% participation, before all charges. */
export function hypotheticalCredit(indexChange) {
  const number = Number(indexChange);
  return Number.isFinite(number) ? Math.max(0, Math.min(8, number)) : 0;
}

export const annuityStages = [
  {
    label: 'STAGE 01 / FUNDING',
    title: 'A contract. A purpose.',
    copy: 'You commit money to an insurer under a specific contract. Before that decision, understand your need for accessible savings, the insurer’s financial strength, and the contract’s costs.',
    question: '“How much money will I still be able to access for unexpected needs?”'
  },
  {
    label: 'STAGE 02 / BEFORE INCOME STARTS',
    title: 'A date on the horizon.',
    copy: 'The contract sets when income begins. In a deferred income annuity, payments start at a future date. Access to the funds may be limited or unavailable while you wait.',
    question: '“What happens if my plans change before my income begins?”'
  },
  {
    label: 'STAGE 03 / INCOME PAYMENTS',
    title: 'Income, under agreed terms.',
    copy: 'Payments follow the option selected, such as a defined period or a lifetime. Survivor or refund provisions can affect payment amounts. Fixed payments may lose purchasing power as prices rise.',
    question: '“What would my spouse or beneficiaries receive if I died?”'
  }
];
