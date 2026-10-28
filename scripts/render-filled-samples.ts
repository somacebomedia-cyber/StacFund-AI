// scripts/render-filled-samples.ts
/**
 * Development QA helper: fills the NYDA and ECRDA/sefa templates with a
 * realistic answer set and writes the filled PDFs to <repo>/.form-qa so the
 * drawn marks can be inspected visually (and by scripts/verify-form-positions.py,
 * which needs python3 + pdfplumber).
 *
 * Run: npx tsx scripts/render-filled-samples.ts [outputDir]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { fillFormPdf } from '../services/formAutofill';
import { NYDA_GRANT_VOUCHER } from '../services/formTemplates/nydaGrantVoucher';
import { SEFA_BLENDED_FINANCE } from '../services/formTemplates/sefaBlendedFinance';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const OUT = process.argv[2] ?? join(ROOT, '.form-qa');

const nydaAnswers: Record<string, string> = {
  'a.full_names': 'Thandiwe',
  'a.surname': 'Mokoena',
  'a.id': '9901235600089',
  'a.gender': 'female',
  'a.age': '27',
  'a.population': 'african',
  'a.home_language': 'isiXhosa',
  'a.disability': 'no',
  'a.cell': '083 555 0199',
  'a.email': 'thandiwe@example.co.za',
  'a.address': '14 Main Road, Dutywa',
  'a.address_code': '5050',
  'a.postal_address': 'PO Box 88, Dutywa',
  'a.postal_code': '5050',
  'a.province': 'Eastern Cape',
  'a.geo': 'rural',
  'a.qualifications': 'Diploma in Agriculture',
  'a.training': 'NYDA business management training 2025',
  'a.nok_name': 'Nomvula Mokoena',
  'a.nok_address': '14 Main Road, Dutywa',
  'a.nok_cell': '083 555 0200',
  'a.nok_relationship': 'Mother',
  'b.existing': 'yes',
  'b.trained': 'yes',
  'biz.name': 'Thandiwe Poultry Enterprise',
  'biz.type': 'Free-range egg production',
  'biz.sector': 'agro',
  'biz.entity': 'pty',
  'f.amount': '120000',
  'f.use.1.what': 'Layer hens and laying cages',
  'f.use.1.amount': '80000',
  'f.use.2.what': 'Feed for the first cycle',
  'f.use.2.amount': '40000',
  'g.1': 'yes', 'g.2': 'yes', 'g.3': 'yes', 'g.6': 'yes', 'g.7': 'yes', 'g.8': 'yes',
};

const sefaAnswers: Record<string, string> = {
  'a.cipc_name': 'Mokoena Agri Processing (Pty) Ltd',
  'a.trading_name': 'Mokoena Agri',
  'a.business_type': 'Vegetable production and agro processing',
  'a.industry': 'Agriculture',
  'a.reg_number': '2022/111222/07',
  'a.reg_date': '8 June 2022',
  'a.email': 'info@mokoenaagri.co.za',
  'a.tax_ref': '9876543210',
  'a.physical_address': 'Farm 43, Dutywa Road, Dutywa',
  'a.phys_province': 'Eastern Cape',
  'a.phys_code': '5050',
  'a.postal_address': 'PO Box 88, Dutywa',
  'a.post_province': 'Eastern Cape',
  'a.post_code': '5050',
  'a.district': 'Amathole',
  'a.local_muni': 'Mbhashe',
  'a.township': 'Dutywa',
  'a.gps': '-32.19, 28.18',
  'a.years_trading': '3',
  'a.employees': '6',
  'a.new_jobs': '4',
  'a.correspondence': 'email',
  'c.title': 'mr',
  'c.surname': 'Mokoena',
  'c.first_names': 'Sipho',
  'c.cell': '083 555 0188',
  'c.tel': '045 555 0100',
  'c.email': 'sipho@mokoenaagri.co.za',
  'f.equipment': '450000',
  'f.vegetables': '150000',
  'f.working': '100000',
  'b.surname': 'Mokoena',
  'b.first_names': 'Sipho',
  'b.id_number': '8502105600083',
  'b.gender': 'male',
  'b.nationality': 'South African',
  'b.race': 'Black',
  'b.disability': 'no',
  'b.role': 'Managing Director',
  'b.email': 'sipho@mokoenaagri.co.za',
  'b.cell': '083 555 0188',
  'b.marital_status': 'Married',
  'b.physical_address': '14 Main Road, Dutywa',
  'b.phys_code': '5050',
  'sig.surname': 'Mokoena',
  'sig.full_names': 'Sipho Mokoena',
  'sig.designation': 'Managing Director',
  'c.1': 'yes', 'c.3': 'yes', 'c.4': 'yes', 'c.5': 'yes', 'c.6': 'yes', 'c.8': 'yes', 'c.9': 'yes', 'c.16': 'yes', 'c.18': 'yes',
};

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const nydaBytes = new Uint8Array(readFileSync(join(ROOT, 'public', 'assets', 'forms', 'nyda-grant-application.pdf')));
  const sefaBytes = new Uint8Array(readFileSync(join(ROOT, 'public', 'assets', 'forms', 'sefa-ecrda-blended-finance.pdf')));

  const nyda = await fillFormPdf(NYDA_GRANT_VOUCHER, nydaBytes, nydaAnswers);
  writeFileSync(join(OUT, 'filled-nyda.pdf'), nyda.bytes);
  console.log(`filled-nyda.pdf written (${nyda.bytes.length} bytes, cut: ${nyda.cutKeys.join(', ') || 'none'})`);

  const nydaStartup = await fillFormPdf(NYDA_GRANT_VOUCHER, nydaBytes, { ...nydaAnswers, 'b.existing': 'no' });
  writeFileSync(join(OUT, 'filled-nyda-startup.pdf'), nydaStartup.bytes);
  console.log(`filled-nyda-startup.pdf written (${nydaStartup.bytes.length} bytes)`);

  const sefa = await fillFormPdf(SEFA_BLENDED_FINANCE, sefaBytes, sefaAnswers);
  writeFileSync(join(OUT, 'filled-sefa.pdf'), sefa.bytes);
  console.log(`filled-sefa.pdf written (${sefa.bytes.length} bytes, cut: ${sefa.cutKeys.join(', ') || 'none'})`);
}

main().catch((e) => {
  console.error('Script crashed:', e);
  process.exit(1);
});
