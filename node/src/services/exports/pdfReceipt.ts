import PDFDocument from "pdfkit";
import { logger } from "../../helpers/logger";

/**
 * PDF generation for transaction receipts and bulk transaction listings.
 *
 * Mirror of Laravel's mPDF-rendered transaction_receipt.blade.php and
 * beneficiary_transactions.blade.php views. We use pdfkit (lightweight,
 * pure-Node) instead of a headless browser so the generation cost is
 * predictable at scale.
 *
 * Password protection (mirror of mpdf->SetProtection) is intentionally
 * omitted: pdfkit doesn't support 40-bit RC4 encryption and most modern
 * PDF readers reject it anyway. The Laravel feature was opt-in via the
 * `password_enabled` merchant setting; if you need it we can swap pdfkit
 * for hummus-recipe in a follow-up.
 */

export interface ReceiptDetails {
  unique_id: string;
  created_at: string;
  name: string;
  amount: string;
  currency: string;
  purpose_of_payment: string;
  fx_rate: string;
  status: string;
  remarks: string;
  beneficiary_name: string;
  account_number: string;
  bank_name: string;
  bank_code: string;
  routing_number: string;
  sender_name: string;
  sender_address: string;
  sender_city: string;
  sender_state: string;
  sender_postal_code: string;
  sender_country: string;
  utr_no: string;
  txn_ref_no: string;
}

async function pdfToBuffer(builder: (doc: InstanceType<typeof PDFDocument>) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      builder(doc);
    } catch (err) {
      reject(err);
      return;
    }
    doc.end();
  });
}

function row(doc: InstanceType<typeof PDFDocument>, label: string, value: string): void {
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#444").text(label, { continued: true });
  doc.font("Helvetica").fillColor("#000").text(`  ${value || "-"}`);
}

export async function generateReceiptPdf(d: ReceiptDetails): Promise<Buffer> {
  return pdfToBuffer((doc) => {
    doc.fontSize(18).font("Helvetica-Bold").text("Transaction Receipt", { align: "center" });
    doc.moveDown();

    doc.fontSize(11).font("Helvetica").fillColor("#666")
      .text(`Receipt ID: ${d.unique_id}`)
      .text(`Date: ${d.created_at}`);
    doc.moveDown();

    doc.fontSize(13).font("Helvetica-Bold").fillColor("#000").text("Transaction");
    doc.moveDown(0.3);
    row(doc, "Amount:", `${d.amount} ${d.currency}`);
    row(doc, "FX Rate:", d.fx_rate);
    row(doc, "Status:", d.status);
    row(doc, "Purpose:", d.purpose_of_payment);
    row(doc, "Remarks:", d.remarks);
    row(doc, "UTR / Reference:", d.utr_no || d.txn_ref_no);
    doc.moveDown();

    doc.fontSize(13).font("Helvetica-Bold").text("Beneficiary");
    doc.moveDown(0.3);
    row(doc, "Name:", d.beneficiary_name);
    row(doc, "Account #:", d.account_number);
    row(doc, "Bank:", d.bank_name);
    row(doc, "Bank Code:", d.bank_code);
    row(doc, "Routing #:", d.routing_number);
    doc.moveDown();

    doc.fontSize(13).font("Helvetica-Bold").text("Sender");
    doc.moveDown(0.3);
    row(doc, "Name:", d.sender_name);
    row(
      doc,
      "Address:",
      [d.sender_address, d.sender_city, d.sender_state, d.sender_postal_code, d.sender_country]
        .filter(Boolean)
        .join(", "),
    );
  });
}

export async function generateBulkTransactionsPdf(
  rows: Array<Record<string, string | number | null | undefined>>,
  title = "Beneficiary Transactions",
): Promise<Buffer> {
  return pdfToBuffer((doc) => {
    doc.fontSize(16).font("Helvetica-Bold").text(title);
    doc.moveDown();

    if (rows.length === 0) {
      doc.fontSize(11).font("Helvetica").text("No transactions found.");
      return;
    }

    const headers = ["txn_ref_no", "sending_amount", "receiving_amount", "status", "created_at"];
    doc.fontSize(10).font("Helvetica-Bold");
    doc.text(headers.join(" | "));
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(9);
    for (const r of rows) {
      const line = headers.map((h) => String(r[h] ?? "")).join(" | ");
      doc.text(line);
    }
  });
}

export function safeReceipt(d: Partial<ReceiptDetails>): ReceiptDetails {
  // Defensive defaults so missing fields never blow up rendering.
  return {
    unique_id: d.unique_id ?? "",
    created_at: d.created_at ?? "",
    name: d.name ?? "",
    amount: d.amount ?? "",
    currency: d.currency ?? "",
    purpose_of_payment: d.purpose_of_payment ?? "",
    fx_rate: d.fx_rate ?? "",
    status: d.status ?? "",
    remarks: d.remarks ?? "",
    beneficiary_name: d.beneficiary_name ?? "",
    account_number: d.account_number ?? "",
    bank_name: d.bank_name ?? "",
    bank_code: d.bank_code ?? "",
    routing_number: d.routing_number ?? "",
    sender_name: d.sender_name ?? "",
    sender_address: d.sender_address ?? "",
    sender_city: d.sender_city ?? "",
    sender_state: d.sender_state ?? "",
    sender_postal_code: d.sender_postal_code ?? "",
    sender_country: d.sender_country ?? "",
    utr_no: d.utr_no ?? "",
    txn_ref_no: d.txn_ref_no ?? "",
  };
}

void logger;
