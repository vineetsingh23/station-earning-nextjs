export type RegisterRow = Record<string, string>;
export type ColumnKind = "text" | "number" | "calculated";

export type RegisterColumn = {
  key: string;
  label: string;
  kind?: ColumnKind;
  group: string;
};

export type RegisterData = {
  tomRows: RegisterRow[];
  tvmRows: RegisterRow[];
  dashboard: DashboardData;
};

export type DenominationCount = { value: number; count: string };
export type DashboardData = {
  previousDaysCash: string;
  bankSent: string;
  bankNotes: DenominationCount[];
  cashNotes: DenominationCount[];
  coins: DenominationCount[];
  imprestIssued: Array<{ tom: string; imprest: string; advance: string }>;
  imprestReceived: Array<{ tom: string; amount: string }>;
  outstanding: {
    previousAfc: string;
    previousTvm: string;
    previousMisc: string;
    miscCurrent: string;
    paidAfc: string;
    paidTvm: string;
    paidMisc: string;
    waivedAfc: string;
    waivedTvm: string;
    waivedMisc: string;
  };
  sv2: Array<{
    particular: string;
    opening: string;
    received: string;
    sentRevenue: string;
    sentOther: string;
    sale: string;
  }>;
};

const columns = (group: string, fields: Array<[string, string, ColumnKind?]>): RegisterColumn[] =>
  fields.map(([key, label, kind]) => ({ key, label, kind, group }));

export const TOM_COLUMNS: RegisterColumn[] = [
  ...columns("Shift details", [
    ["cccNumber", "TOM / CC No.", "text"],
    ["operatorName", "Operator name", "text"],
    ["employeeNumber", "Employee No.", "text"],
    ["shiftStartTime", "Start time", "text"],
    ["shiftEndTime", "End time", "text"],
    ["shiftNumber", "Shift No.", "text"],
  ]),
  ...columns("QR tickets", [
    ["freeExitQuantity", "Free exit qty"],
    ["qrSaleQuantity", "QR sale qty"],
    ["qrSaleAmount", "QR sale amount"],
    ["paidExitQrQuantity", "Paid exit qty"],
    ["paidExitQrAmount", "Paid exit amount"],
    ["qrRefundQuantity", "QR refund qty"],
    ["qrRefundAmount", "QR refund amount"],
  ]),
  ...columns("Contactless smart card", [
    ["cscSaleSv2Sv6Quantity", "SV-2 / SV-6 sale qty"],
    ["cscSaleT1T3Quantity", "T-1 / T-3 sale qty"],
    ["cscSaleAmount", "CSC sale amount"],
    ["cscSaleCancelQuantity", "Sale cancel qty"],
    ["cscSaleCancelAmount", "Sale cancel amount"],
    ["cscRefundSv2Quantity", "SV-2 refund qty"],
    ["cscRefundT1T3Quantity", "T-1 / T-3 refund qty"],
    ["cscRefundAmount", "CSC refund amount"],
  ]),
  ...columns("Add value", [
    ["addValueSv2TomQuantity", "SV2 TOM qty"],
    ["addValueSv2TomAmount", "SV2 TOM amount"],
    ["addValueNcmcTomQuantity", "NCMC TOM qty"],
    ["addValueNcmcTomAmount", "NCMC TOM amount"],
    ["addValueCancelQuantity", "Cancel qty"],
    ["addValueCancelAmount", "Cancel amount"],
  ]),
  ...columns("Surcharge", [
    ["surchargeCashQuantity", "Cash surcharge qty"],
    ["surchargeCashAmount", "Cash surcharge amount"],
    ["surchargePurseQuantity", "Purse surcharge qty"],
    ["surchargePurseAmount", "Purse surcharge amount"],
    ["ncmcCashQuantity", "NCMC cash qty"],
    ["ncmcCashAmount", "NCMC cash amount"],
    ["ncmcPurseQuantity", "NCMC purse qty"],
    ["ncmcPurseAmount", "NCMC purse amount"],
  ]),
  { key: "afcCollectionTotal", label: "AFC collection total", kind: "calculated", group: "Totals" },
  ...columns("Other earnings", [
    ["eibAmount", "E.I.B."],
    ["sv4TopUpQuantity", "SV4 top-up qty"],
    ["sv4TopUpAmount", "SV4 top-up amount"],
    ["readableCscRefundQuantity", "Readable CSC refund qty"],
    ["readableCscRefundAmount", "Readable CSC refund amount"],
    ["tourCardRefundQuantity", "Tour card refund qty"],
    ["tourCardRefundAmount", "Tour card refund amount"],
    ["securityDepositRefundQuantity", "Security deposit refund qty"],
    ["securityDepositRefundAmount", "Security deposit refund amount"],
    ["manualPenaltyQuantity", "Manual penalty qty"],
    ["manualPenaltyAmount", "Manual penalty amount"],
    ["hhtPenaltyCashQuantity", "HHT cash penalty qty"],
    ["hhtPenaltyCashAmount", "HHT cash penalty amount"],
    ["hhtPenaltyPurseQuantity", "HHT purse penalty qty"],
    ["hhtPenaltyPurseAmount", "HHT purse penalty amount"],
    ["miscEarningAmount", "Misc earning"],
    ["manualQrRefundQuantity", "Manual QR refund qty"],
    ["manualQrRefundAmount", "Manual QR refund amount"],
    ["parkingManualCash", "Parking manual cash"],
    ["parkingHhtCash", "Parking HHT cash"],
    ["parkingHhtPurse", "Parking HHT purse"],
  ]),
  { key: "totalEarning", label: "Total earning", kind: "calculated", group: "Totals" },
  ...columns("Cashless details", [
    ["posAtCcc", "POS at CCC"],
    ["posAtTvm", "POS at TVM"],
    ["staticQrAtCcc", "Static QR at CCC"],
    ["posAtRctm", "POS at RCTM"],
    ["posAtScvm", "POS at SCVM"],
    ["upiAtTvm", "UPI at TVM"],
    ["upiAtTomCc", "UPI at TOM / CC"],
    ["hhtPenaltyPurseCashless", "HHT penalty purse"],
    ["hhtParkingPurse", "HHT parking purse"],
    ["surchargeThroughPurseAfc", "AFC surcharge via purse"],
    ["surchargeThroughPurseNcmc", "NCMC surcharge via purse"],
  ]),
  ...columns("Outstanding", [
    ["outsourceEarningAmount", "Outsource earning"],
    ["outstandingCurrentAfc", "Current AFC OS"],
    ["outstandingCurrentMisc", "Current Misc OS"],
    ["tvmMutilatedFakeNotes", "TVM mutilated / fake notes"],
    ["outstandingPaidAfc", "Paid AFC OS"],
    ["outstandingPaidMisc", "Paid Misc OS"],
  ]),
  { key: "cashDepositedByOperator", label: "Cash deposited", kind: "calculated", group: "Totals" },
];

export const TVM_COLUMNS: RegisterColumn[] = [
  ...columns("Machine", [["tvmNumber", "TVM No.", "text"]]),
  ...columns("QR sales", [["tvmQrSaleQuantity", "QR qty"], ["tvmQrSaleAmount", "QR amount"]]),
  ...columns("Add value", [["tvmAddValueQuantity", "Add value qty"], ["tvmAddValueAmount", "Add value amount"]]),
  ...columns("NCMC add value", [["tvmNcmcAddValueQuantity", "NCMC qty"], ["tvmNcmcAddValueAmount", "NCMC amount"]]),
  ...columns("RCTM add value", [["tvmRctmAddValueQuantity", "RCTM qty"], ["tvmRctmAddValueAmount", "RCTM amount"]]),
  { key: "tvmTotal", label: "Total", kind: "calculated", group: "Totals" },
  ...columns("Cashless", [["tvmPaymentByPos", "Payment by POS"], ["tvmPaymentByUpi", "Payment by UPI"]]),
  ...columns("Outstanding", [["tvmOutstandingCurrent", "Current outstanding"]]),
  { key: "tvmFinalTotal", label: "Final total", kind: "calculated", group: "Totals" },
];

export const SV2_PARTICULARS = [
  "SV2",
  "Manual refunded card",
  "Tour card refunded",
  "Other",
  "Souvenir tokens",
] as const;

const number = (row: RegisterRow, key: string) => Number.parseFloat(row[key] ?? "") || 0;
const sum = (row: RegisterRow, keys: string[]) => keys.reduce((total, key) => total + number(row, key), 0);
const ticketSaleNet = (row: RegisterRow) =>
  sum(row, ["qrSaleAmount", "paidExitQrAmount", "cscSaleAmount"]) -
  sum(row, ["qrRefundAmount", "cscSaleCancelAmount", "cscRefundAmount"]);
const addValueNet = (row: RegisterRow) =>
  sum(row, ["addValueSv2TomAmount", "addValueNcmcTomAmount"]) - number(row, "addValueCancelAmount");
const surchargeTotal = (row: RegisterRow) =>
  sum(row, ["surchargeCashAmount", "surchargePurseAmount", "ncmcCashAmount", "ncmcPurseAmount"]);
const cashlessTotal = (row: RegisterRow) =>
  sum(row, [
    "posAtCcc", "posAtTvm", "staticQrAtCcc", "posAtRctm", "posAtScvm",
    "upiAtTvm", "upiAtTomCc", "hhtPenaltyPurseCashless", "hhtParkingPurse",
  ]);

export function calculateTomRow(row: RegisterRow) {
  const afcCollectionTotal = ticketSaleNet(row) + addValueNet(row) + surchargeTotal(row);
  const totalEarning =
    afcCollectionTotal +
    sum(row, [
      "eibAmount", "sv4TopUpAmount", "miscEarningAmount", "parkingManualCash",
      "parkingHhtCash", "parkingHhtPurse", "manualPenaltyAmount",
      "hhtPenaltyCashAmount", "hhtPenaltyPurseAmount",
    ]) -
    sum(row, [
      "readableCscRefundAmount", "tourCardRefundAmount",
      "securityDepositRefundAmount", "manualQrRefundAmount",
    ]);
  const cashDepositedByOperator =
    totalEarning - cashlessTotal(row) -
    sum(row, ["surchargeThroughPurseAfc", "surchargeThroughPurseNcmc", "outstandingCurrentAfc", "outstandingCurrentMisc"]) +
    sum(row, ["outsourceEarningAmount", "outstandingPaidAfc", "outstandingPaidMisc"]);
  return { afcCollectionTotal, totalEarning, cashDepositedByOperator };
}

export function calculateTvmRow(row: RegisterRow) {
  const tvmTotal = sum(row, [
    "tvmQrSaleAmount", "tvmAddValueAmount", "tvmNcmcAddValueAmount", "tvmRctmAddValueAmount",
  ]);
  return {
    tvmTotal,
    tvmFinalTotal: tvmTotal - sum(row, ["tvmPaymentByPos", "tvmPaymentByUpi", "tvmOutstandingCurrent"]),
  };
}

export function calculatedValue(row: RegisterRow, key: string) {
  if (key in calculateTomRow(row)) return calculateTomRow(row)[key as keyof ReturnType<typeof calculateTomRow>];
  if (key in calculateTvmRow(row)) return calculateTvmRow(row)[key as keyof ReturnType<typeof calculateTvmRow>];
  return number(row, key);
}

export function createEmptyRow(columns: RegisterColumn[], index: number): RegisterRow {
  return Object.fromEntries(columns.map(column => [
    column.key,
    column.key === "cccNumber" ? String(index + 1) :
      column.key === "tvmNumber" ? `TVM-${String(index + 1).padStart(2, "0")}` : "",
  ]));
}

const denominations = (values: number[]) => values.map(value => ({ value, count: "" }));

export function createDefaultRegisterData(): RegisterData {
  return {
    tomRows: Array.from({ length: 12 }, (_, index) => createEmptyRow(TOM_COLUMNS, index)),
    tvmRows: Array.from({ length: 12 }, (_, index) => createEmptyRow(TVM_COLUMNS, index)),
    dashboard: {
      previousDaysCash: "",
      bankSent: "",
      bankNotes: denominations([500, 200, 100, 50, 20, 10]),
      cashNotes: denominations([500, 200, 100, 50, 20, 10]),
      coins: denominations([1, 2, 5, 10, 20]),
      imprestIssued: Array.from({ length: 4 }, (_, index) => ({
        tom: String(80 + index), imprest: "", advance: "",
      })),
      imprestReceived: Array.from({ length: 4 }, (_, index) => ({
        tom: String(80 + index), amount: "",
      })),
      outstanding: {
        previousAfc: "", previousTvm: "", previousMisc: "", miscCurrent: "",
        paidAfc: "", paidTvm: "", paidMisc: "",
        waivedAfc: "", waivedTvm: "", waivedMisc: "",
      },
      sv2: SV2_PARTICULARS.map(particular => ({
        particular, opening: "", received: "", sentRevenue: "", sentOther: "", sale: "",
      })),
    },
  };
}

export function emptyTableData(data: RegisterData): RegisterData {
  return {
    tomRows: data.tomRows.map(row => ({ ...row })),
    tvmRows: data.tvmRows.map(row => ({ ...row })),
    dashboard: structuredClone(data.dashboard),
  };
}

export function rowSum(rows: RegisterRow[], key: string, formula?: (row: RegisterRow) => number) {
  return rows.reduce((total, row) => total + (formula ? formula(row) : number(row, key)), 0);
}

export function deriveSv2Opening(
  previousRows: DashboardData["sv2"],
  currentRows: DashboardData["sv2"],
) {
  return currentRows.map((row, index) => ({
    ...row,
    opening: String(
      (Number(previousRows[index]?.opening) || 0) + (Number(previousRows[index]?.received) || 0) -
      (Number(previousRows[index]?.sentRevenue) || 0) - (Number(previousRows[index]?.sentOther) || 0) -
      (Number(previousRows[index]?.sale) || 0),
    ),
  }));
}
