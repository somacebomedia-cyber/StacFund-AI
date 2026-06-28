export interface FinancialAssumptions {
  initialRevenue: number;
  revenueGrowthRateY2: number; // percentage, e.g., 15 for 15%
  revenueGrowthRateY3: number;
  cogsPercent: number; // Cost of Goods Sold as % of revenue
  operatingExpensesPercent: number; // OPEX as % of revenue
  taxRate: number; // e.g. 27 for 27%
  fundingAmount: number;
}

export function generateFinancialStatements(assumptions: FinancialAssumptions) {
  const y1Rev = assumptions.initialRevenue;
  const y2Rev = y1Rev * (1 + assumptions.revenueGrowthRateY2 / 100);
  const y3Rev = y2Rev * (1 + assumptions.revenueGrowthRateY3 / 100);

  const formatZAR = (val: number) => "R " + Math.round(val).toLocaleString('en-ZA');

  const calcYear = (rev: number) => {
    const cogs = rev * (assumptions.cogsPercent / 100);
    const grossProfit = rev - cogs;
    const opex = rev * (assumptions.operatingExpensesPercent / 100);
    const ebitda = grossProfit - opex;
    const tax = ebitda > 0 ? ebitda * (assumptions.taxRate / 100) : 0;
    const netIncome = ebitda - tax;
    return { rev, cogs, grossProfit, opex, ebitda, tax, netIncome };
  };

  const y1 = calcYear(y1Rev);
  const y2 = calcYear(y2Rev);
  const y3 = calcYear(y3Rev);

  const profitLoss = [
    { label: "Revenue", values: [formatZAR(y1.rev), formatZAR(y2.rev), formatZAR(y3.rev)], isTotal: false },
    { label: "Cost of Sales", values: [formatZAR(y1.cogs), formatZAR(y2.cogs), formatZAR(y3.cogs)], isTotal: false },
    { label: "Gross Profit", values: [formatZAR(y1.grossProfit), formatZAR(y2.grossProfit), formatZAR(y3.grossProfit)], isTotal: true },
    { label: "Operating Expenses", values: [formatZAR(y1.opex), formatZAR(y2.opex), formatZAR(y3.opex)], isTotal: false },
    { label: "EBITDA", values: [formatZAR(y1.ebitda), formatZAR(y2.ebitda), formatZAR(y3.ebitda)], isTotal: true },
    { label: "Tax", values: [formatZAR(y1.tax), formatZAR(y2.tax), formatZAR(y3.tax)], isTotal: false },
    { label: "Net Income", values: [formatZAR(y1.netIncome), formatZAR(y2.netIncome), formatZAR(y3.netIncome)], isTotal: true },
  ];

  // Simplified Cash Flow & Balance Sheet for the example
  const cashFlow = [
    { label: "Starting Cash", values: [formatZAR(assumptions.fundingAmount), formatZAR(assumptions.fundingAmount + y1.netIncome), formatZAR(assumptions.fundingAmount + y1.netIncome + y2.netIncome)], isTotal: false },
    { label: "Net Cash from Operations", values: [formatZAR(y1.netIncome), formatZAR(y2.netIncome), formatZAR(y3.netIncome)], isTotal: false },
    { label: "Ending Cash", values: [formatZAR(assumptions.fundingAmount + y1.netIncome), formatZAR(assumptions.fundingAmount + y1.netIncome + y2.netIncome), formatZAR(assumptions.fundingAmount + y1.netIncome + y2.netIncome + y3.netIncome)], isTotal: true },
  ];

  const balanceSheet = [
    { label: "Assets", values: ["", "", ""], isHeader: true, isTotal: false },
    { label: "Cash & Equivalents", values: [formatZAR(assumptions.fundingAmount + y1.netIncome), formatZAR(assumptions.fundingAmount + y1.netIncome + y2.netIncome), formatZAR(assumptions.fundingAmount + y1.netIncome + y2.netIncome + y3.netIncome)], isTotal: false },
    { label: "Total Assets", values: [formatZAR(assumptions.fundingAmount + y1.netIncome), formatZAR(assumptions.fundingAmount + y1.netIncome + y2.netIncome), formatZAR(assumptions.fundingAmount + y1.netIncome + y2.netIncome + y3.netIncome)], isTotal: true },
    { label: "Liabilities & Equity", values: ["", "", ""], isHeader: true, isTotal: false },
    { label: "Owner's Equity", values: [formatZAR(assumptions.fundingAmount + y1.netIncome), formatZAR(assumptions.fundingAmount + y1.netIncome + y2.netIncome), formatZAR(assumptions.fundingAmount + y1.netIncome + y2.netIncome + y3.netIncome)], isTotal: false },
    { label: "Total Liabilities & Equity", values: [formatZAR(assumptions.fundingAmount + y1.netIncome), formatZAR(assumptions.fundingAmount + y1.netIncome + y2.netIncome), formatZAR(assumptions.fundingAmount + y1.netIncome + y2.netIncome + y3.netIncome)], isTotal: true },
  ];

  return { profitLoss, balanceSheet, cashFlow };
}
