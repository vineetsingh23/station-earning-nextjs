import { describe, expect, it } from "vitest";
import {
  calculateTomRow,
  calculateTvmRow,
  createDefaultRegisterData,
  deriveSv2Opening,
  type RegisterRow,
} from "./register-data";
import { registerDataSchema } from "./validation";

describe("earning calculations", () => {
  it("calculates the source TOM/CC AFC, earning, and deposited cash formulas", () => {
    const row: RegisterRow = {
      qrSaleAmount: "100",
      paidExitQrAmount: "20",
      cscSaleAmount: "50",
      qrRefundAmount: "5",
      cscSaleCancelAmount: "10",
      cscRefundAmount: "3",
      addValueSv2TomAmount: "40",
      addValueNcmcTomAmount: "10",
      addValueCancelAmount: "5",
      surchargeCashAmount: "2",
      surchargePurseAmount: "3",
      ncmcCashAmount: "4",
      ncmcPurseAmount: "1",
      eibAmount: "4",
      sv4TopUpAmount: "5",
      miscEarningAmount: "6",
      parkingManualCash: "7",
      manualPenaltyAmount: "8",
      hhtPenaltyCashAmount: "9",
      hhtPenaltyPurseAmount: "10",
      readableCscRefundAmount: "11",
      tourCardRefundAmount: "12",
      securityDepositRefundAmount: "13",
      manualQrRefundAmount: "14",
      posAtCcc: "25",
      surchargeThroughPurseAfc: "2",
      outstandingCurrentAfc: "10",
      outstandingCurrentMisc: "3",
      outsourceEarningAmount: "5",
      outstandingPaidAfc: "4",
      outstandingPaidMisc: "2",
    };

    expect(calculateTomRow(row)).toEqual({
      afcCollectionTotal: 207,
      totalEarning: 206,
      cashDepositedByOperator: 177,
    });
  });

  it("calculates TVM totals after cashless payments and outstanding", () => {
    expect(calculateTvmRow({
      tvmQrSaleAmount: "100",
      tvmAddValueAmount: "20",
      tvmNcmcAddValueAmount: "30",
      tvmRctmAddValueAmount: "50",
      tvmPaymentByPos: "10",
      tvmPaymentByUpi: "20",
      tvmOutstandingCurrent: "5",
    })).toEqual({ tvmTotal: 200, tvmFinalTotal: 165 });
  });

  it("creates editable default register rows and validates their persisted shape", () => {
    const data = createDefaultRegisterData();
    expect(data.tomRows).toHaveLength(12);
    expect(data.tvmRows).toHaveLength(12);
    expect(registerDataSchema.safeParse(data).success).toBe(true);
  });

  it("carries each SV2 closing balance forward as the next opening balance", () => {
    const nextDay = deriveSv2Opening(
      [{
        particular: "SV2",
        opening: "100",
        received: "40",
        sentRevenue: "5",
        sentOther: "10",
        sale: "20",
      }],
      [{
        particular: "SV2",
        opening: "",
        received: "30",
        sentRevenue: "",
        sentOther: "",
        sale: "",
      }],
    );
    expect(nextDay[0].opening).toBe("105");
    expect(nextDay[0].received).toBe("30");
  });
});
